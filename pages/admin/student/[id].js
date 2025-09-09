"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
// at top of the file
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import AdminSidebar from "../../../components/AdminSidebar"; // ✅ Import Sidebar
import AdminHeader from "../../../components/AdminHeader"; // ✅ Import Sidebar

export default function StudentPage() {
  const router = useRouter();
  const { id } = router.query;

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [dayRecords, setDayRecords] = useState([]);
  const [tableRecords, setTableRecords] = useState([]);
  const [tableTitle, setTableTitle] = useState("");
  const [showNoDataModal, setShowNoDataModal] = useState(false);

  const openNoDataModal = () => setShowNoDataModal(true);
  const closeNoDataModal = () => setShowNoDataModal(false);

  // Fetch student data
  useEffect(() => {
    if (!id || !selectedMonth) return;

    const token = localStorage.getItem("adminToken");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/student/${id}?month=${selectedMonth}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error(`Error: ${res.statusText}`);
        const data = await res.json();
        setStudent(data);
      } catch (err) {
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, selectedMonth, router]);

  // Fetch punch-in/out for specific date
  useEffect(() => {
    if (!id || !selectedDate) return;

    const token = localStorage.getItem("adminToken");
    const fetchDayData = async () => {
      try {
        const res = await fetch(
          `/api/admin/student/${id}?date=${selectedDate}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (!data.dayRecords || data.dayRecords.length === 0) {
          openNoDataModal();
        }
        setDayRecords(data.dayRecords || []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchDayData();
  }, [selectedDate, id]);

  const fetchPrevAndCurrentWeek = async () => {
    const token = localStorage.getItem("adminToken");
    const res = await fetch(`/api/admin/student/${id}?prevWeek=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!data.records || data.records.length === 0) {
      openNoDataModal();
      return;
    }

    setTableTitle(
      `Attendance for ${data.prevWeekRange.start} to ${data.currentWeekRange.end}`
    );
    setTableRecords(data.records || []);
  };

  const fetchSelectedMonth = async () => {
    const token = localStorage.getItem("adminToken");
    const res = await fetch(
      `/api/admin/student/${id}?month=${selectedMonth}&allDays=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = await res.json();
    if (!data.records || data.records.length === 0) {
      openNoDataModal();
    }
    setTableTitle(`Attendance for ${selectedMonth}`);
    setTableRecords(data.records || []);
  };

  const downloadPDF = () => {
    if (!tableRecords.length) return;

    const doc = new jsPDF();
    doc.text(tableTitle || "Attendance", 14, 12);

    autoTable(doc, {
      head: [["Date", "Punch In", "Punch Out"]],
      body: tableRecords.map((r) => [
        r.date,
        r.punchIn ?? "—",
        r.punchOut ?? "—",
      ]),
      startY: 18,
    });

    const safe = (tableTitle || "Attendance").replace(/[\/\\?%*:|"<>]/g, "_");
    doc.save(`${safe}.pdf`);
  };

  const printTable = () => {
    const printContent = `
      <h2>${tableTitle}</h2>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr>
          <th>Date</th>
          <th>Punch In</th>
          <th>Punch Out</th>
        </tr>
        ${tableRecords
          .map(
            (r) => `<tr>
                    <td>${r.date}</td>
                    <td>${r.punchIn || "—"}</td>
                    <td>${r.punchOut || "—"}</td>
                  </tr>`
          )
          .join("")}
      </table>
    `;
    const printWindow = window.open("", "", "height=600,width=800");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading)
    return (
      <p className="text-center p-6 text-gray-600">Loading student data...</p>
    );
  if (error)
    return <p className="text-center p-6 text-red-500">Error: {error}</p>;
  if (!student) return <p className="text-center p-6">No student found.</p>;

  const SummaryCard = ({ title, data }) => (
    <div className="bg-white shadow-lg rounded-xl p-6 border hover:shadow-xl transition-all">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">
        From {data.start} to {data.end}
      </p>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-green-50 rounded-lg">
          <p className="text-3xl font-bold text-green-700">{data.present}</p>
          <p className="text-sm text-gray-500">Present</p>
        </div>
        <div className="p-4 bg-red-50 rounded-lg">
          <p className="text-3xl font-bold text-red-700">{data.absent}</p>
          <p className="text-sm text-gray-500">Absent</p>
        </div>
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-3xl font-bold text-blue-700">{data.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex">
      {/* ✅ Sidebar */}
      <AdminSidebar />

      {/* ✅ Main Content Wrapper */}
      <div className="ml-64 flex-1 flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white overflow-x-hidden">
        {/* ✅ Fixed Header */}
        <AdminHeader showAbsent={"Student Report"} />

        {/* ✅ Page Content (pushed below header with mt-16) */}
        <main className="mt-16 p-6 bg-gradient-to-br from-gray-50 via-white to-gray-100 min-h-screen text-gray-900">
          {/* Student Info */}
          <div className="mb-8">
            <h2 className="text-4xl font-bold text-gray-800">{student.name}</h2>
            <p className="text-lg text-gray-500">Role: {student.role}</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SummaryCard title="Weekly Attendance" data={student.weekly} />
            <SummaryCard title="Monthly Attendance" data={student.monthly} />
          </div>
          <br />

          {/* Date Selector */}
          <div className="mb-6 flex items-center gap-4">
            <label className="text-gray-700 font-medium">Select Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded-lg p-2 shadow-sm"
              min={`${selectedMonth}-01`}
              max={`${selectedMonth}-31`}
            />
          </div>

          {/* Punch Records for a specific date */}
          {selectedDate && dayRecords.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h3 className="text-lg font-semibold mb-3">
                Punch Records for {selectedDate}
              </h3>
              <table className="w-full border mb-4">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 border">Punch In</th>
                    <th className="p-2 border">Punch Out</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRecords.map((r, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border">{r.punchIn || "—"}</td>
                      <td className="p-2 border">{r.punchOut || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={printTable}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow transition-all"
              >
                Print Records
              </button>
            </div>
          )}

          {/* Month Selector */}
          <div className="mb-6 flex items-center gap-4">
            <label className="text-gray-700 font-medium">Select Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border rounded-lg p-2 shadow-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="mb-8 flex flex-wrap gap-4">
            <button
              onClick={fetchPrevAndCurrentWeek}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg shadow transition-all"
            >
              Show Current + Previous Week
            </button>

            <button
              onClick={fetchSelectedMonth}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow transition-all"
            >
              Show Selected Month
            </button>
          </div>

          {/* Week/Month Attendance Table */}
          {tableRecords.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h3 className="text-lg font-semibold mb-3">{tableTitle}</h3>
              <table className="w-full border mb-4">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 border">Date</th>
                    <th className="p-2 border">Punch In</th>
                    <th className="p-2 border">Punch Out</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRecords.map((r, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border">{r.date}</td>
                      <td className="p-2 border">{r.punchIn || "—"}</td>
                      <td className="p-2 border">{r.punchOut || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-3">
                <button
                  onClick={printTable}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow transition-all"
                >
                  Print Table
                </button>
                <button
                  onClick={downloadPDF}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow transition-all"
                >
                  Download PDF
                </button>
              </div>
            </div>
          )}

          {/* No Data Modal */}
          {showNoDataModal && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
              <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-3">
                  No Data Found
                </h2>
                <p className="text-gray-600 mb-5">
                  There are no records available for this selection.
                </p>
                <button
                  onClick={closeNoDataModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
