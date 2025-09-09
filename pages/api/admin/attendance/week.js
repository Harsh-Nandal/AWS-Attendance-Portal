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

    // Group by student (userId preferred, then rollNo, then name)
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
        punchIn: rec.punchIn || "-",
        punchOut: rec.punchOut || "-",
        status: rec.punchIn || rec.punchOut ? "Present" : "Absent",
      });
    }

    const students = Object.values(grouped);

    // ---- WEEK RANGE LOGIC ----
    const showPrevWeek = req.query.week === "prev"; // ?week=prev
    const baseMonday = moment().startOf("isoWeek");

    const monday = showPrevWeek
      ? moment(baseMonday).subtract(1, "week")
      : baseMonday;

    const saturday = moment(monday).add(5, "days").endOf("day");

    // ---- ATTENDANCE CALCULATION ----
    const results = students.map((student) => {
      let presents = 0;
      let absents = 0;
      const daily = [];

      for (
        let day = monday.clone();
        day.isSameOrBefore(saturday, "day");
        day.add(1, "day")
      ) {
        const dayKey = day.format("YYYY-MM-DD");

        // Find attendance record for that day
        const rec = student.records.find((r) => r.date === dayKey);

        if (rec && rec.status === "Present") {
          presents++;
          daily.push({
            date: dayKey,
            status: "Present",
            punchIn: rec.punchIn,
            punchOut: rec.punchOut,
          });
        } else {
          absents++;
          daily.push({
            date: dayKey,
            status: "Absent",
            punchIn: "-",
            punchOut: "-",
          });
        }
      }

      return {
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        userId: student.userId,
        presents,
        absents,
        records: daily,
      };
    });

    // Sort by absences (desc), then name
    results.sort((a, b) => b.absents - a.absents || a.name.localeCompare(b.name));

    res.status(200).json({
      week: showPrevWeek ? "previous" : "current",
      start: monday.format("YYYY-MM-DD"),
      end: saturday.format("YYYY-MM-DD"),
      data: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
}
