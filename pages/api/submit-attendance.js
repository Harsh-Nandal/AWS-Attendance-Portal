// pages/api/submit-attendance.js
import connectDB from "../../lib/mongodb";
import Attendance from "../../models/Attendance";
import User from "../../models/User";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// Force timezone to India (IST)
const APP_TZ = "Asia/Kolkata";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // leave as-is if parse fails
      }
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

    // Get today's date in IST
    const today = dayjs().tz(APP_TZ).format("YYYY-MM-DD");

    let record = await Attendance.findOne({
      userId: String(userId),
      date: today,
    });

    // Current time in IST
    const nowIst = dayjs().tz(APP_TZ);
    const timeString = nowIst.format("HH:mm:ss"); // Punch in/out time
    const recordedAtDate = nowIst.toDate(); // Save Date object in IST

    if (!record) {
      // Punch in
      record = new Attendance({
        userId: String(userId),
        name: user.name || "",
        role: user.role || "",
        date: today,
        punchIn: timeString,
        recordedAt: recordedAtDate,
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
      record.punchOut = timeString;
      record.recordedAt = recordedAtDate;
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
