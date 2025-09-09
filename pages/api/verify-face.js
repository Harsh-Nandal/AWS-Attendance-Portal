// pages/api/verify-face.js
import connectDB from "../../lib/mongodb";
import User from "../../models/User";
import axios from "axios";
import { RekognitionClient, SearchFacesByImageCommand } from "@aws-sdk/client-rekognition";

// ----------------- Configuration / ENV -----------------
const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 0.45); // descriptor fallback (0..1)
const REGION = process.env.AWS_REGION || "ap-south-1";
const REK_COLLECTION = process.env.REKOGNITION_COLLECTION || process.env.REKOG_COLLECTION || "students-collection";
const REKOGNITION_SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? 85); // 0..100 (AWS)
const REKOGNITION_MAX_FACES = Number(process.env.REKOG_MAX_FACES ?? 3);
const REKOG_CONCURRENCY = Math.max(1, Number(process.env.REKOG_CONCURRENCY ?? 4));

// AWS Rekognition client (server-side)
const rekClient = new RekognitionClient({ region: REGION });

// ----------------- helper math functions (unchanged) -----------------
function l2Normalize(arr) {
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) sumSq += arr[i] * arr[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / norm;
  return out;
}

function euclideanDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function bestDistanceToUser(queryDesc, user) {
  const pool = Array.isArray(user.faceDescriptors) && user.faceDescriptors.length
    ? user.faceDescriptors
    : user.faceDescriptor
    ? [user.faceDescriptor]
    : [];

  let best = Infinity;
  for (const d of pool) {
    if (!Array.isArray(d) || d.length !== queryDesc.length) continue;
    const dist = euclideanDistance(queryDesc, l2Normalize(d));
    if (dist < best) best = dist;
  }
  return best;
}

// ----------------- Rekognition helpers -----------------
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

// ----------------- API handler -----------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { imageData, imageUrl, descriptor } = req.body;

    // If image provided, prefer Rekognition flow
    if (imageData || imageUrl) {
      // prepare image buffer
      let buffer;
      try {
        buffer = await getImageBuffer({ imageData, imageUrl });
      } catch (err) {
        console.error("Image buffer error:", err);
        return res.status(400).json({ message: "Invalid imageData or imageUrl", error: err.message });
      }

      // ensure DB connection available
      await connectDB();

      // call Rekognition
      let rk;
      try {
        rk = await rekognitionSearch(buffer);
      } catch (rkErr) {
        console.error("Rekognition error:", rkErr);
        // If Rekognition failed and descriptor exists, fall back to descriptor path below.
        if (!descriptor) {
          return res.status(500).json({ message: "Rekognition error", error: rkErr.message });
        }
      }

      if (rk && rk.found) {
        const top = rk.topMatch;
        const similarity = typeof top.Similarity === "number" ? top.Similarity : null; // 0..100
        const rekFace = top.Face || {};

        // Map Rekognition match to local user:
        // prefer ExternalImageId (set during IndexFaces), else try FaceId mapping
        let user = null;
        if (rekFace.ExternalImageId) {
          user = await User.findOne({ "rekognition.externalImageId": rekFace.ExternalImageId }).lean();
        }
        if (!user && rekFace.FaceId) {
          user = await User.findOne({ "rekognition.faceIds": rekFace.FaceId }).lean();
        }

        if (!user) {
          // matched in collection but no mapping in DB
          return res.status(200).json({
            success: false,
            message: "Face matched in Rekognition but no local user mapping found",
            rawMatch: top,
            similarity,
          });
        }

        // convert similarity -> "distance" (lower is better) to match existing client expectations
        const matchDistance = similarity === null ? null : Number((1 - similarity / 100).toFixed(4));
        const confidence = similarity === null
          ? null
          : Number(((similarity - REKOGNITION_SIMILARITY_THRESHOLD) / (100 - REKOGNITION_SIMILARITY_THRESHOLD)).toFixed(3));

        return res.status(200).json({
          success: true,
          distance: matchDistance, // lower is better (0..1)
          similarity, // Rekognition similarity (0..100)
          confidence, // rough 0..1 confidence relative to threshold
          user: {
            name: user.name,
            role: user.role || "student",
            userId: String(user.userId ?? user._id),
            imageUrl: user.imageUrl || null,
          },
          rawMatch: top,
        });
      }

      // Rekognition ran but no match
      return res.status(200).json({ success: false, message: "No Rekognition match", raw: rk ? rk.raw : null });
    }

    // ---------------- FALLBACK: descriptor-based matching (original behavior) ----------------
    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ message: "Provide imageData/imageUrl OR descriptor" });
    }

    if (descriptor.length < 64) {
      return res.status(400).json({ message: "Descriptor too short" });
    }

    // Normalize the incoming embedding
    const query = l2Normalize(descriptor);

    await connectDB();

    // Only fetch what we need
    const users = await User.find({}, "name role userId imageUrl faceDescriptor faceDescriptors").lean();

    let globalBest = { user: null, distance: Infinity };

    for (const user of users) {
      const dist = bestDistanceToUser(query, user);
      if (Number.isFinite(dist) && dist < globalBest.distance) {
        globalBest = { user, distance: dist };
      }
    }

    if (globalBest.user && globalBest.distance < MATCH_THRESHOLD) {
      const confidence = Math.max(0, Math.min(1, 1 - globalBest.distance / MATCH_THRESHOLD));

      return res.status(200).json({
        success: true,
        distance: Number(globalBest.distance.toFixed(4)),
        confidence: Number(confidence.toFixed(3)),
        user: {
          name: globalBest.user.name,
          role: globalBest.user.role,
          userId: String(globalBest.user.userId ?? globalBest.user._id),
          imageUrl: globalBest.user.imageUrl || null,
        },
      });
    }

    return res.status(200).json({
      success: false,
      distance: Number.isFinite(globalBest.distance) ? Number(globalBest.distance.toFixed(4)) : null,
    });
  } catch (error) {
    console.error("Face verification error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
}
