// pages/api/create-collection.js
import {
  RekognitionClient,
  CreateCollectionCommand,
  DescribeCollectionCommand,
} from "@aws-sdk/client-rekognition";
import connectDB from "../../lib/mongodb";

const REGION = process.env.AWS_REGION || "ap-south-1";
const DEFAULT_COLLECTION = process.env.REKOGNITION_COLLECTION || process.env.REKOG_COLLECTION || "students-collection";
const rekClient = new RekognitionClient({ region: REGION });

export default async function handler(req, res) {
  // Basic safety: require POST for create and allow GET to inspect status
  const adminToken = process.env.DEV_ADMIN_TOKEN;

  if (req.method === "GET") {
    // Return which collection name would be used and region (no secret exposure)
    return res.status(200).json({
      ok: true,
      region: REGION,
      collection: DEFAULT_COLLECTION,
      message: "Send POST to create. Provide x-admin-token header if DEV_ADMIN_TOKEN is set.",
      devAdminTokenSet: !!adminToken,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method Not Allowed - use POST" });
  }

  // If adminToken is set in env, require matching header for safety in dev
  if (adminToken && req.headers["x-admin-token"] !== adminToken) {
    return res.status(403).json({ ok: false, message: "Forbidden - invalid admin token" });
  }

  try {
    // optional DB connect if you want to log/persist collection creation - safe no-op if not needed
    try {
      await connectDB();
    } catch (dbErr) {
      // don't fail just because DB connect isn't available; just log
      console.warn("create-collection: DB connect failed (continuing):", dbErr?.message || dbErr);
    }

    const { collectionId } = req.body || {};
    const col = (collectionId || DEFAULT_COLLECTION).toString();

    // First try DescribeCollection to avoid error if it already exists
    try {
      const descCmd = new DescribeCollectionCommand({ CollectionId: col });
      const desc = await rekClient.send(descCmd);
      return res.status(200).json({
        ok: true,
        exists: true,
        collection: col,
        message: `Collection '${col}' already exists in region ${REGION}.`,
        describe: desc,
      });
    } catch (describeErr) {
      // If describe failed because collection not found, proceed to create
      // For other errors, throw
      if (describeErr?.name && describeErr.name !== "ResourceNotFoundException") {
        console.error("DescribeCollection error (non-notfound):", describeErr);
        throw describeErr;
      }
      // else collection not found -> create it
    }

    const cmd = new CreateCollectionCommand({ CollectionId: col });
    const out = await rekClient.send(cmd);

    return res.status(200).json({
      ok: true,
      created: true,
      collection: col,
      message: `Collection '${col}' created in region ${REGION}.`,
      result: out,
    });
  } catch (err) {
    console.error("Create collection error:", err);
    const msg = err?.message || String(err);
    return res.status(500).json({ ok: false, message: "Could not create collection", error: msg });
  }
}
