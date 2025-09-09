// pages/api/submit-attendance.js
import connectDB from "../../lib/mongodb";
import Attendance from "../../models/Attendance";
import User from "../../models/User";
import dayjs from "dayjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const { userId } = body || {};
    if (!userId) {
      return res.status(400).json({ message: "Missing userId" });
    }

    await connectDB();

    // Check if user exists
    const user = await User.findOne({ userId: String(userId) }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = dayjs().format("YYYY-MM-DD");
    let record = await Attendance.findOne({ userId: String(userId), date: today });

    if (!record) {
      // Punch in
      const punchInTime = dayjs().format("HH:mm:ss");
      record = new Attendance({
        userId: String(userId),
        name: user.name || "",
        role: user.role || "",
        date: today,
        punchIn: punchInTime,
        recordedAt: new Date(),
      });
      await record.save();

      return res.status(200).json({
        ok: true,
        message: "Punched In Successfully",
        status: "Punched In",
        punchIn: record.punchIn,
        recordedAt: record.recordedAt,
      });
    }

    if (record && record.punchIn && !record.punchOut) {
      // Punch out
      record.punchOut = dayjs().format("HH:mm:ss");
      record.recordedAt = new Date();
      await record.save();

      return res.status(200).json({
        ok: true,
        message: "Punched Out Successfully",
        status: "Punched Out",
        punchIn: record.punchIn,
        punchOut: record.punchOut,
        recordedAt: record.recordedAt,
      });
    }

    // Already punched out
    return res.status(200).json({
      ok: true,
      message: "Already Punched Out",
      status: "Punched Out",
      punchIn: record.punchIn,
      punchOut: record.punchOut,
      recordedAt: record.recordedAt,
    });
  } catch (err) {
    console.error("[submit-attendance] error:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
    });
  }
}
