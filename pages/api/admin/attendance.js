import connectDB from "../../../lib/mongodb";
import Attendance from "../../../models/Attendance";
import Student from "../../../models/User";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // ✅ Admin token auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    if (token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    await connectDB();

    // Fetch all students and attendance records
    const allStudents = await Student.find().lean();
    const allAttendance = await Attendance.find().lean();

    // Date helpers
    const toYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const enumerateDaysYMD = (start, end) => {
      const days = [];
      const d = new Date(start);
      while (d <= end) {
        days.push(toYMD(d));
        d.setDate(d.getDate() + 1);
      }
      return days;
    };

    const filterByDate = (records, start, end) =>
      records.filter((r) => {
        const recDate =
          r.date instanceof Date ? new Date(r.date) : new Date(r.date);
        recDate.setHours(0, 0, 0, 0);
        return recDate >= start && recDate <= end;
      });

    const getAbsentStudentsForDay = (ymd) => {
      const dayRecords = allAttendance.filter((r) => {
        if (typeof r.date === "string") return r.date === ymd;
        return toYMD(new Date(r.date)) === ymd;
      });

      const presentIds = new Set(
        dayRecords.filter((r) => r.punchIn).map((r) => r.userId)
      );

      return allStudents.filter((s) => !presentIds.has(s.userId));
    };

    // 🔄 NEW: Get all absentees sorted (no limit)
    const getAbsenteesSortedBetween = (start, end) => {
      const days = enumerateDaysYMD(start, end);
      const counts = {};

      days.forEach((ymd) => {
        const absentees = getAbsentStudentsForDay(ymd);
        absentees.forEach((s) => {
          counts[s.userId] = (counts[s.userId] || 0) + 1;
        });
      });

      return Object.entries(counts)
        .map(([userId, absences]) => {
          const student = allStudents.find((s) => s.userId === userId);
          return {
            userId,
            name: student?.name || "Unknown",
            role: student?.role || "Student",
            absences,
          };
        })
        .sort((a, b) => b.absences - a.absences);
    };

    const todayRecords = filterByDate(allAttendance, today, today);
    const weekRecords = filterByDate(allAttendance, startOfWeek, today);
    const monthRecords = filterByDate(allAttendance, startOfMonth, today);

    const getAbsentStudents = (records) => {
      const presentIds = new Set(
        records.filter((r) => r.punchIn).map((r) => r.userId)
      );
      return allStudents.filter((s) => !presentIds.has(s.userId));
    };

    res.status(200).json({
      allStudents,
      daily: todayRecords.filter((r) => r.punchIn),
      weekly: weekRecords.filter((r) => r.punchIn),
      monthly: monthRecords.filter((r) => r.punchIn),
      absentDaily: getAbsentStudents(todayRecords),
      absentWeekly: getAbsentStudents(weekRecords),
      absentMonthly: getAbsentStudents(monthRecords),
      absenteesWeek: getAbsenteesSortedBetween(startOfWeek, today),
      absenteesMonth: getAbsenteesSortedBetween(startOfMonth, today),
    });
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
}
