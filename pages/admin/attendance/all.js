"use client";
import { useEffect, useState } from "react";
import AdminSidebar from "../../../components/AdminSidebar"; // ✅ Import sidebar
import AdminHeader from "../../../components/AdminHeader"; // ✅ Import sidebar

export default function AttendancePage() {
  const [data, setData] = useState([]);
  const [info, setInfo] = useState({
    period: "week",
    range: "current",
    start: "",
    end: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("week"); // "week" or "month"
  const [range, setRange] = useState("current"); // "current" or "prev"

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("adminToken");
        const res = await fetch(
          `/api/admin/attendance/${period}?${period}=${range}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error(res.statusText);
        const json = await res.json();
        setData(json.data || []);
        setInfo({
          period,
          range: json[period],
          start: json.start,
          end: json.end,
        });
      } catch (err) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [period, range]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  // Filter students based on search input
  const filteredData = data.filter(
    (student) =>
      student.name?.toLowerCase().includes(search.toLowerCase()) ||
      student.rollNo?.toString().includes(search)
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* ✅ Sidebar */}
      <AdminSidebar />

      {/* ✅ Main Area */}
      <div className="ml-64 flex-1 flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white overflow-x-hidden">
        {/* ✅ Header */}
        <AdminHeader showAbsent={"Monthly and Weekly Reports"} />

        {/* ✅ Main Content */}
        <main className="mt-16 p-6">
          {/* Header */}
          <h2 className="text-xl font-bold mb-2">
            {period === "week"
              ? `Weekly Attendance (${info.range?.toUpperCase()} week)`
              : `Monthly Attendance (${info.range?.toUpperCase()} month)`}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            {info.start} → {info.end}
          </p>

          {/* Period Switch */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPeriod("week")}
              className={`px-4 py-2 rounded ${
                period === "week"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black border"
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setPeriod("month")}
              className={`px-4 py-2 rounded ${
                period === "month"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black border"
              }`}
            >
              Monthly
            </button>
          </div>

          {/* Range Switch */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setRange("current")}
              className={`px-4 py-2 rounded ${
                range === "current"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black border"
              }`}
            >
              Current {period}
            </button>
            <button
              onClick={() => setRange("prev")}
              className={`px-4 py-2 rounded ${
                range === "prev"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-black border"
              }`}
            >
              Previous {period}
            </button>
          </div>

          {/* 🔍 Search Bar */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search by name or roll number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
          </div>

          {filteredData.length === 0 ? (
            <p className="text-gray-400">No students found.</p>
          ) : (
            <>
              {/* Weekly Table */}
              {period === "week" &&
                filteredData.map((student) => (
                  <div
                    key={student._id}
                    className="mb-6 p-4 bg-white text-black rounded shadow"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {student.name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          Roll No: {student.rollNo}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-600 font-medium">
                          Presents: {student.presents}
                        </p>
                        <p className="text-red-600 font-medium">
                          Absents: {student.absents}
                        </p>
                      </div>
                    </div>

                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Punch In</th>
                          <th className="p-2 text-left">Punch Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(student.records ?? []).map((rec, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="p-2">{rec.date}</td>
                            <td
                              className={`p-2 font-medium ${
                                rec.status === "Present"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {rec.status}
                            </td>
                            <td className="p-2">{rec.punchIn}</td>
                            <td className="p-2">{rec.punchOut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

              {/* Monthly Table */}
              {period === "month" &&
                filteredData.map((student) => (
                  <div
                    key={student._id}
                    className="mb-4 p-4 bg-white text-black rounded shadow flex justify-between"
                  >
                    <div>
                      <h3 className="text-lg font-semibold">{student.name}</h3>
                      <p className="text-sm text-gray-600">
                        Roll No: {student.rollNo}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-600 font-medium">
                        Presents: {student.presents}
                      </p>
                      <p className="text-red-600 font-medium">
                        Absents: {student.absents}
                      </p>
                    </div>
                  </div>
                ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
