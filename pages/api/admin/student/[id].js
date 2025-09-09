import connectDB from "../../../../lib/mongodb";
import Attendance from "../../../../models/Attendance";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    if (token !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }

    await connectDB();

    const { id, month, date, prevWeek, allDays } = req.query;
    const studentId = Array.isArray(id) ? id[0] : id;

    const toYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const daysBetweenInclusive = (startYMD, endYMD) => {
      const [ys, ms, ds] = startYMD.split("-").map(Number);
      const [ye, me, de] = endYMD.split("-").map(Number);
      const start = new Date(ys, ms - 1, ds);
      const end = new Date(ye, me - 1, de);
      const diff = Math.floor((end - start) / 86400000) + 1;
      return diff < 0 ? 0 : diff;
    };

    const filterByYMDRange = (records, startYMD, endYMD) =>
      records.filter((r) => r?.date && r.date >= startYMD && r.date <= endYMD);

    // 1️⃣ If specific date requested
    if (date) {
      const dayRecords = await Attendance.find({
        userId: studentId,
        date,
      }).lean();
      return res.status(200).json({ dayRecords });
    }

    // In your prevWeek=true section inside handler:

    if (prevWeek === "true") {
      const today = new Date();

      // Current week range (Sunday to today)
      const startOfCurrentWeek = new Date(today);
      startOfCurrentWeek.setDate(today.getDate() - today.getDay());
      const startCurrentYMD = toYMD(startOfCurrentWeek);
      const endCurrentYMD = toYMD(today);

      // Previous week range (Sunday to Saturday)
      const endOfPrevWeek = new Date(startOfCurrentWeek);
      endOfPrevWeek.setDate(startOfCurrentWeek.getDate() - 1);
      const startOfPrevWeek = new Date(endOfPrevWeek);
      startOfPrevWeek.setDate(endOfPrevWeek.getDate() - 6);

      const startPrevYMD = toYMD(startOfPrevWeek);
      const endPrevYMD = toYMD(endOfPrevWeek);

      const records = await Attendance.find({ userId: studentId }).lean();

      const prevWeekRecords = filterByYMDRange(
        records,
        startPrevYMD,
        endPrevYMD
      );
      const currentWeekRecords = filterByYMDRange(
        records,
        startCurrentYMD,
        endCurrentYMD
      );

      // Merge and sort by date
      const mergedRecords = [...prevWeekRecords, ...currentWeekRecords].sort(
        (a, b) => a.date.localeCompare(b.date)
      );

      return res.status(200).json({
        records: mergedRecords,
        prevWeekRange: { start: startPrevYMD, end: endPrevYMD },
        currentWeekRange: { start: startCurrentYMD, end: endCurrentYMD },
      });
    }

    // 3️⃣ If full month table requested
    if (allDays === "true" && month) {
      const [year, monthNum] = month.split("-").map(Number);
      const startOfMonth = new Date(year, monthNum - 1, 1);
      const endOfMonth = new Date(year, monthNum, 0);
      const startYMD = toYMD(startOfMonth);
      const endYMD = toYMD(endOfMonth);

      const records = await Attendance.find({ userId: studentId }).lean();
      const monthlyRecords = filterByYMDRange(records, startYMD, endYMD);

      return res.status(200).json({ records: monthlyRecords });
    }

    // 4️⃣ Default: Weekly + Monthly summaries
    if (!month) {
      return res.status(400).json({ message: "Month (YYYY-MM) is required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayYMD = toYMD(today);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekYMD = toYMD(startOfWeek);

    const [year, monthNum] = month.split("-").map(Number);
    const startOfMonth = new Date(year, monthNum - 1, 1);
    const endOfMonth = new Date(year, monthNum, 0);
    const startOfMonthYMD = toYMD(startOfMonth);
    const endOfMonthYMD = toYMD(endOfMonth);

    const allRecords = await Attendance.find({ userId: studentId }).lean();

    const weeklyRecords = filterByYMDRange(
      allRecords,
      startOfWeekYMD,
      todayYMD
    );
    const monthlyRecords = filterByYMDRange(
      allRecords,
      startOfMonthYMD,
      endOfMonthYMD
    );

    const countPresentDays = (records) => {
      const presentDays = new Set();
      for (const r of records) {
        if (r?.punchIn && r?.date) presentDays.add(r.date);
      }
      return presentDays.size;
    };

    const summarize = (records, startYMD, endYMD) => {
      const total = daysBetweenInclusive(startYMD, endYMD);
      const present = countPresentDays(records);
      const absent = Math.max(0, total - present);
      return { present, absent, total, start: startYMD, end: endYMD };
    };

    const weekly = summarize(weeklyRecords, startOfWeekYMD, todayYMD);
    const monthly = summarize(monthlyRecords, startOfMonthYMD, endOfMonthYMD);

    const studentData = {
      userId: studentId,
      name: allRecords[0]?.name || "Unknown",
      role: allRecords[0]?.role || "Unknown",
      weekly,
      monthly,
    };

    return res.status(200).json(studentData);
  } catch (err) {
    console.error("API error:", err);
    return res
      .status(500)
      .json({ message: "Server Error", error: err.message });
  }
}
