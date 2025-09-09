// pages/api/index-face.js
import axios from "axios";
import { RekognitionClient, IndexFacesCommand } from "@aws-sdk/client-rekognition";
import connectDB from "../../lib/mongodb";
import User from "../../models/User";

/**
 * Index a face for a user into Rekognition and update the User doc.
 *
 * POST body: { userId: "<your-user-id>", imageUrl: "<cloudinary-or-public-url>" }
 *
 * Response:
 *  - success: true and saved faceIds
 *  - success: false with error message
 *
 * SECURITY: Protect this endpoint (admin only) in production.
 */

const REGION = process.env.AWS_REGION || "ap-south-1";
const REK_COLLECTION = process.env.REKOGNITION_COLLECTION || "students-collection";
const rekClient = new RekognitionClient({ region: REGION });

async function bufferFromUrl(url) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(resp.data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed - use POST" });
  }

  try {
    // Quick dev-safety: optional admin header token (set DEV_ADMIN_TOKEN in env)
    const adminToken = process.env.DEV_ADMIN_TOKEN;
    if (adminToken && req.headers["x-admin-token"] !== adminToken) {
      return res.status(403).json({ success: false, message: "Forbidden - invalid admin token" });
    }

    const { userId, imageUrl } = req.body || {};
    if (!userId || !imageUrl) {
      return res.status(400).json({ success: false, message: "userId and imageUrl required" });
    }

    // fetch buffer from Cloudinary (or any public URL)
    let buffer;
    try {
      buffer = await bufferFromUrl(imageUrl);
    } catch (err) {
      console.error("Failed to download image:", err);
      return res.status(400).json({ success: false, message: "Could not download imageUrl", error: err.message });
    }

    // call Rekognition IndexFaces
    const cmd = new IndexFacesCommand({
      CollectionId: REK_COLLECTION,
      Image: { Bytes: buffer },
      ExternalImageId: String(userId), // store userId as ExternalImageId - recommended
      DetectionAttributes: [], // keep minimal, optionally ["ALL"]
    });

    let out;
    try {
      out = await rekClient.send(cmd);
    } catch (err) {
      console.error("IndexFaces error:", err);
      return res.status(500).json({ success: false, message: "Rekognition IndexFaces failed", error: err.message || String(err) });
    }

    const faceRecords = out.FaceRecords || [];
    const faceIds = faceRecords.map((r) => r.Face && r.Face.FaceId).filter(Boolean);

    // Save mapping into User document
    await connectDB();

    const update = {
      "rekognition.externalImageId": String(userId),
      "rekognition.faceIds": faceIds,
      // optional: also store lastIndexedAt, indexResponse
      "rekognition.lastIndexedAt": new Date(),
      "rekognition.indexResponse": {
        faceRecordsCount: faceRecords.length,
        responseMetadata: { requestId: out.$metadata?.requestId ?? null },
      },
    };

    const user = await User.findOneAndUpdate({ userId: String(userId) }, { $set: update }, { new: true });
    if (!user) {
      // If user not found, still return faceIds so you can map manually
      return res.status(200).json({
        success: true,
        warning: "User not found in DB - Rekognition indexed but user doc not updated",
        faceIds,
        raw: out,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Indexed face(s) and updated user",
      userId: user.userId ?? user._id,
      faceIds,
      raw: out,
    });
  } catch (err) {
    console.error("index-face error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message || String(err) });
  }
}
