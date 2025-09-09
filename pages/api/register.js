// pages/api/register.js
import connectDB from "../../lib/mongodb";
import User from "../../models/User";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import {
  RekognitionClient,
  IndexFacesCommand
} from "@aws-sdk/client-rekognition";

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Rekognition config
const REGION = process.env.AWS_REGION || "ap-south-1";
const REK_COLLECTION =
  process.env.REKOGNITION_COLLECTION || process.env.REKOG_COLLECTION || "students-collection";
const rekClient = new RekognitionClient({ region: REGION });

/**
 * Register endpoint:
 * - Body: { name, userId, role, imageData (dataURL) }
 * - Uploads image to Cloudinary
 * - Creates user document
 * - Indexes face into Rekognition (retries up to 3 times)
 * - Updates user.rekognition with indexing results (or returns rekognitionError)
 */

async function indexFaceWithRetries(buffer, userId, maxAttempts = 3) {
  let attempt = 0;
  let lastErr = null;

  while (attempt < maxAttempts) {
    try {
      const cmd = new IndexFacesCommand({
        CollectionId: REK_COLLECTION,
        Image: { Bytes: buffer },
        ExternalImageId: String(userId),
        DetectionAttributes: [],
        MaxFaces: 1,
      });

      const out = await rekClient.send(cmd);
      return { success: true, out };
    } catch (err) {
      lastErr = err;
      // If collection not found, don't retry — return immediately
      if (err?.name === "ResourceNotFoundException" || (err?.message && err.message.includes("Collection"))) {
        return { success: false, fatal: true, error: err };
      }
      attempt += 1;
      // simple backoff
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  return { success: false, fatal: false, error: lastErr };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  let body = req.body;

  // Accept raw JSON string as well as parsed body
  if (!body || typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      console.error("❌ Invalid JSON body");
      return res.status(400).json({ message: "Invalid request body format." });
    }
  }

  const { name, userId, role, imageData } = body;

  console.log("🔎 Received register request:", {
    name,
    userId,
    role,
    imageLength: imageData?.length ?? null,
  });

  // Basic validation
  if (
    typeof name !== "string" ||
    typeof userId !== "string" ||
    typeof role !== "string" ||
    typeof imageData !== "string"
  ) {
    console.warn("❌ Validation failed. Missing required fields.");
    return res.status(400).json({
      message: "Backend :: Missing or invalid data. Please register again.",
    });
  }

  try {
    await connectDB();

    // Prevent duplicate userId
    const existingUser = await User.findOne({ userId });
    if (existingUser) {
      return res.status(409).json({ message: "User ID already exists." });
    }

    // Upload image to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(imageData, {
      folder: "mdci-faces",
      // you can add transformations here if desired
    });

    const imageUrl = uploadResponse.secure_url;
    console.log("✅ Cloudinary upload success:", imageUrl);

    // Create user document (rekognition will be filled after indexing)
    const newUserData = {
      name,
      userId,
      role,
      imageUrl,
    };

    const newUser = await User.create(newUserData);
    console.log("✅ User created (DB):", newUser._id);

    // Download the uploaded image into buffer for Rekognition
    try {
      const resp = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
      });
      const buffer = Buffer.from(resp.data);

      // Index into Rekognition with retries
      const idxResult = await indexFaceWithRetries(buffer, userId, 3);

      if (!idxResult.success) {
        // fatal error (e.g., collection missing)
        if (idxResult.fatal) {
          console.error("❌ Rekognition fatal error:", idxResult.error);
          const createdUser = await User.findById(newUser._id).lean();
          return res.status(200).json({
            message: "User created but Rekognition indexing failed",
            user: createdUser,
            rekognitionError:
              `Rekognition collection '${REK_COLLECTION}' not found. Create it via /api/create-collection or AWS console. ` +
              `AWS message: ${idxResult.error?.message ?? String(idxResult.error)}`,
          });
        }

        // non-fatal after retries
        console.error("❌ Rekognition indexing failed after retries:", idxResult.error);
        const createdUser = await User.findById(newUser._id).lean();
        return res.status(200).json({
          message: "User created but Rekognition indexing failed after retries",
          user: createdUser,
          rekognitionError: idxResult.error?.message || String(idxResult.error),
        });
      }

      // Success: parse IndexFaces output
      const out = idxResult.out;
      const faceRecords = out.FaceRecords || [];
      const faceIds = faceRecords.map((r) => r.Face && r.Face.FaceId).filter(Boolean);

      // Prepare rekognition update object
      const rekUpdate = {
        "rekognition.externalImageId": String(userId),
        "rekognition.faceIds": faceIds,
        "rekognition.lastIndexedAt": new Date(),
        "rekognition.indexResponse": out, // store raw response (schema allows Mixed)
      };

      await User.updateOne({ _id: newUser._id }, { $set: rekUpdate });

      const updatedUser = await User.findById(newUser._id).lean();

      console.log("✅ Indexed face for user:", userId, "faceIds:", faceIds);

      return res.status(200).json({
        message: "Success",
        user: updatedUser,
        rekognition: { faceIds, raw: out },
      });
    } catch (downloadErr) {
      console.error("❌ Error downloading image for Rekognition:", downloadErr);
      const createdUser = await User.findById(newUser._id).lean();
      return res.status(200).json({
        message: "User created but Rekognition indexing failed (image download error)",
        user: createdUser,
        rekognitionError: downloadErr?.message || String(downloadErr),
      });
    }
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

// Allow large payloads (images)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};
