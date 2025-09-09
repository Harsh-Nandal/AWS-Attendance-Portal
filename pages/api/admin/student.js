import connectDB from "../../../lib/mongodb";
import Attendance from "../../../models/Attendance";


export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { id } = req.query;

  try {
    // Token check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    if (token !== "some-admin-token") {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    // DB connect
    await connectDB();

    // Fetch attendance for this student
    const records = await Attendance.find({ userId: id }).lean();
    if (!records.length) {
      return res.status(404).json({ message: "No records found for this student" });
    }

    const studentData = {
      userId: id,
      name: records[0].name,
      role: records[0].role,
      attendance: records.map(r => ({
        date: r.date,
        punchIn: r.punchIn || null,
        punchOut: r.punchOut || null
      }))
    };

    return res.status(200).json(studentData);
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ message: "Server Error" });
  }
}
