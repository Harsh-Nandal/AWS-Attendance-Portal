// pages/api/match-face.js
import * as faceapi from "face-api.js";
import { Canvas, Image, ImageData } from "canvas";
import * as tf from "@tensorflow/tfjs-node";
import path from "path";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import axios from "axios";
import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";

// Monkey patch face-api for Node.js (used only for descriptor fallback)
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// ------------- AWS / Rekognition config (env-driven) -------------
const REGION = process.env.AWS_REGION || "ap-south-1";
const REK_COLLECTION =
  process.env.REKOGNITION_COLLECTION ||
  process.env.REKOG_COLLECTION ||
  "students-collection";
const REKOGNITION_SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? 85); // 0..100
const REKOGNITION_MAX_FACES = Number(process.env.REKOGNITION_MAX_FACES ?? 3);

// Rekognition client
const rekClient = new RekognitionClient({ region: REGION });

// ------------- face-api model loading (only if descriptor fallback used) -------------
let modelsLoaded = false;
async function loadModels() {
  if (!modelsLoaded) {
    const MODEL_PATH = path.join(process.cwd(), "public", "models");
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
      faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH),
    ]);
    modelsLoaded = true;
    console.log("✅ Face-api models loaded from:", MODEL_PATH);
  }
}

// ------------- utility math for descriptor fallback -------------
function normalizeDescriptor(descriptor) {
  const norm = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0)) || 1;
  return descriptor.map((val) => val / norm);
}

// ------------- Rekognition helpers -------------
async function getImageBuffer({ imageData, imageUrl }) {
  if (imageData) {
    const m = imageData.match(/^data:.+;base64,(.*)$/);
    if (!m) throw new Error("Invalid imageData (expected dataURL)");
    return Buffer.from(m[1], "base64");
  }
  if (imageUrl) {
    const resp = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
    return Buffer.from(resp.data);
  }
  throw new Error("No imageData or imageUrl provided");
}

async function rekognitionSearch(buffer) {
  const cmd = new SearchFacesByImageCommand({
    CollectionId: REK_COLLECTION,
    Image: { Bytes: buffer },
    FaceMatchThreshold: REKOGNITION_SIMILARITY_THRESHOLD,
    MaxFaces: REKOGNITION_MAX_FACES,
  });
  const out = await rekClient.send(cmd);
  const matches = out.FaceMatches || [];
  if (!matches.length) return { found: false, raw: out };
  return { found: true, topMatch: matches[0], raw: out };
}

// ------------- API handler -------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    await dbConnect();

    // Accept either:
    // - imageData (dataURL) or imageUrl (Cloudinary) -> Rekognition flow
    // - OR descriptor (128-length array) -> face-api fallback
    const { imageData, imageUrl, descriptor } = req.body;

    // ---------- Rekognition flow (preferred when image provided) ----------
    if (imageData || imageUrl) {
      let buffer;
      try {
        buffer = await getImageBuffer({ imageData, imageUrl });
      } catch (imgErr) {
        console.error("Image buffer error:", imgErr);
        return res.status(400).json({ success: false, message: "Invalid imageData or imageUrl", error: imgErr.message });
      }

      // call rekognition
      let rk;
      try {
        rk = await rekognitionSearch(buffer);
      } catch (rkErr) {
        console.error("Rekognition error:", rkErr);
        // If Rekognition fails and descriptor exists, fall back to descriptor below
        if (!descriptor) {
          return res.status(500).json({ success: false, message: "Rekognition error", error: rkErr.message });
        }
      }

      if (rk && rk.found) {
        const top = rk.topMatch;
        const similarity = typeof top.Similarity === "number" ? top.Similarity : null; // 0..100
        const rekFace = top.Face || {};

        // Try to map to User:
        // Prefer ExternalImageId (recommended when indexing)
        let user = null;
        if (rekFace.ExternalImageId) {
          user = await User.findOne({ "rekognition.externalImageId": rekFace.ExternalImageId }).lean();
        }
        if (!user && rekFace.FaceId) {
          user = await User.findOne({ "rekognition.faceIds": rekFace.FaceId }).lean();
        }

        if (!user) {
          return res.status(200).json({
            success: false,
            message: "Face found in Rekognition collection but no local user mapping",
            rawMatch: top,
            similarity,
          });
        }

        // Convert similarity to a 'distance' (0..1) where smaller is better (like your descriptor matching)
        const distance = similarity === null ? null : Number((1 - similarity / 100).toFixed(4));

        return res.status(200).json({
          success: true,
          user: {
            name: user.name,
            role: user.role || "student",
            userId: user.userId ?? user._id,
            imageUrl: user.imageUrl || null,
          },
          similarity, // Rekognition metric 0..100 (higher is better)
          distance, // converted 0..1 (lower is better)
          rawMatch: top,
        });
      }

      // No match from Rekognition
      return res.status(404).json({ success: false, message: "No Rekognition match", raw: rk ? rk.raw : null });
    }

    // ---------- Descriptor fallback using face-api on server ----------
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: "Descriptor must be a valid 128-length array" });
    }

    // load face-api models only when descriptor flow used
    await loadModels();

    const inputDescriptor = new Float32Array(descriptor);
    const normalizedInput = normalizeDescriptor(inputDescriptor);

    // Prepare labeled descriptors from DB
    const labeledDescriptors = [];
    const users = await User.find({});

    for (const user of users) {
      if (user.faceDescriptor && user.faceDescriptor.length === 128) {
        const dbDescriptor = new Float32Array(user.faceDescriptor);
        const normalizedDb = normalizeDescriptor(dbDescriptor);
        labeledDescriptors.push(
          new faceapi.LabeledFaceDescriptors(user.userId.toString(), [normalizedDb])
        );
      } else if (Array.isArray(user.faceDescriptors) && user.faceDescriptors.length) {
        // if user has multiple descriptors stored
        const arr = user.faceDescriptors
          .filter(d => Array.isArray(d) && d.length === 128)
          .map(d => new Float32Array(d).map(v => v / Math.sqrt(d.reduce((s, x) => s + x*x, 0) || 1)));
        if (arr.length) {
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(user.userId.toString(), arr));
        }
      }
    }

    if (labeledDescriptors.length === 0) {
      return res.status(404).json({ success: false, message: "No stored face descriptors found" });
    }

    // Use FaceMatcher for consistent matching (threshold 0.4 as before)
    const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.4);
    const bestMatch = matcher.findBestMatch(normalizedInput);

    console.log(`🔍 Best match: ${bestMatch.label}, distance: ${bestMatch.distance}`);

    if (bestMatch.label !== "unknown") {
      const matchedUser = users.find((u) => u.userId.toString() === bestMatch.label);
      if (!matchedUser) {
        return res.status(404).json({ success: false, message: "Matched user id not found in DB" });
      }
      return res.status(200).json({
        success: true,
        name: matchedUser.name,
        role: matchedUser.role,
        userId: matchedUser.userId,
        distance: bestMatch.distance,
      });
    } else {
      return res.status(404).json({ success: false, message: "No matching face found" });
    }
  } catch (error) {
    console.error("❌ Error in match-face API:", error);
    return res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
  }
}
