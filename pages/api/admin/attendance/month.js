import connectDB from "../../../../lib/mongodb";
import Attendance from "../../../../models/Attendance";
import moment from "moment";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  await connectDB();

  try {
    const allRecords = await Attendance.find({}).lean();

    // Group by student
    const grouped = {};
    for (const rec of allRecords) {
      const key = rec.userId || rec.rollNo || rec.name;
      if (!key) continue;

      if (!grouped[key]) {
        grouped[key] = {
          _id: rec._id,
          name: rec.name || "",
          rollNo: rec.rollNo || "",
          userId: rec.userId || "",
          records: [],
        };
      }

      grouped[key].records.push({
        date: moment(rec.date).format("YYYY-MM-DD"),
        status: rec.punchIn || rec.punchOut ? "Present" : "Absent",
      });
    }

    const students = Object.values(grouped);

    // ---- MONTH RANGE LOGIC ----
    const showPrevMonth = req.query.month === "prev"; // ?month=prev
    const baseMonth = moment().startOf("month");

    const monthStart = showPrevMonth
      ? moment(baseMonth).subtract(1, "month")
      : baseMonth;

    const monthEnd = moment(monthStart).endOf("month");

    // ---- ATTENDANCE CALCULATION ----
    const results = students.map((student) => {
      let presents = 0;
      let absents = 0;

      for (
        let day = monthStart.clone();
        day.isSameOrBefore(monthEnd, "day");
        day.add(1, "day")
      ) {
        const dayKey = day.format("YYYY-MM-DD");

        const rec = student.records.find((r) => r.date === dayKey);

        if (rec && rec.status === "Present") {
          presents++;
        } else {
          absents++;
        }
      }

      return {
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        userId: student.userId,
        presents,
        absents,
      };
    });

    // Sort by absences (desc), then name
    results.sort((a, b) => b.absents - a.absents || a.name.localeCompare(b.name));

    res.status(200).json({
      month: showPrevMonth ? "previous" : "current",
      start: monthStart.format("YYYY-MM-DD"),
      end: monthEnd.format("YYYY-MM-DD"),
      data: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
}
