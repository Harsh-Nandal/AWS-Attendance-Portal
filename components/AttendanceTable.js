"use client";
import Link from "next/link";

export default function AttendanceTable({ attendanceList }) {
  return (
    <div className="px-6 pb-6">
      <div className="bg-gray-100 text-gray-800 rounded-xl shadow-xl overflow-hidden border border-gray-300">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
              <tr>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Role</th>
                <th className="p-4 text-left">Date</th>
                <th className="p-4 text-left">Punch In</th>
                <th className="p-4 text-left">Punch Out</th>
              </tr>
            </thead>
            <tbody>
              {attendanceList.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="text-center p-6 text-gray-500 italic"
                  >
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                attendanceList.map((entry, index) => {
                  const isAbsent =
                    !entry.punchIn && !entry.punchOut; // condition for absent

                  return (
                    <tr
                      key={index}
                      className="border-b hover:bg-gray-200 transition"
                    >
                      <td className="p-4">
                        <Link
                          href={`/admin/student/${entry.userId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {entry.name || "Unknown"}
                        </Link>
                      </td>
                      <td className="p-4">{entry.role || "-"}</td>

                      {/* Show date for both present & absent */}
                      <td className="p-4">
                        {entry.date
                          ? new Date(entry.date).toLocaleDateString()
                          : new Date().toLocaleDateString()}
                      </td>

                      {/* Show Punch In / Out only if present */}
                      {isAbsent ? (
                        <>
                          <td className="p-4 text-gray-400 italic">Absent</td>
                          <td className="p-4 text-gray-400 italic">Absent</td>
                        </>
                      ) : (
                        <>
                          <td className="p-4">{entry.punchIn || "-"}</td>
                          <td className="p-4">{entry.punchOut || "-"}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
