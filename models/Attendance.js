// models/Attendance.js
import mongoose from "mongoose";

const AttendanceSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  punchIn: { type: String }, // "HH:mm:ss"
  punchOut: { type: String }, // "HH:mm:ss"
  recordedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Attendance || mongoose.model("Attendance", AttendanceSchema);
