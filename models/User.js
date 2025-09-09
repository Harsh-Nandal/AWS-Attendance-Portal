// models/User.js
import mongoose from "mongoose";

const RekognitionSchema = new mongoose.Schema({
  externalImageId: { type: String }, // maps to your userId
  faceIds: { type: [String], default: [] }, // Rekognition FaceIds
  lastIndexedAt: { type: Date }, // when Rekognition was updated
  indexResponse: { type: mongoose.Schema.Types.Mixed }, // raw response metadata
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: String, required: true, unique: true }, // unique student/faculty ID
  role: { type: String, enum: ["student", "faculty"], required: true },
  imageUrl: { type: String, required: true }, // Cloudinary image
  rekognition: { type: RekognitionSchema, default: {} }, // AWS Rekognition data
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
