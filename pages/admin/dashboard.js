"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Slider from "react-slick";

import AdminSidebar from "../../components/AdminSidebar";
import AdminHeader from "../../components/AdminHeader";
import AttendanceTable from "../../components/AttendanceTable";

export default function AdminDashboard() {
  const [data, setData] = useState({
    daily: [],
    weekly: [],
    monthly: [],
    absentDaily: [],
    absentWeekly: [],
    absentMonthly: [],
    absenteesWeek: [],
    absenteesMonth: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("daily");
  const [showAbsent, setShowAbsent] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [search, setSearch] = useState(""); // ✅ Search input state

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (!token) router.replace("/admin/login");
    else setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch("/api/admin/attendance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
        const json = await res.json();
        setData((prev) => ({
          ...prev,
          ...json,
          absenteesWeek: json.absenteesWeek ?? [],
          absenteesMonth: json.absenteesMonth ?? [],
        }));
      } catch (err) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authChecked, router]);

  if (!authChecked || loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-gray-800"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-red-100 text-red-700 p-6">
        <h2 className="text-xl font-bold mb-4">Error Loading Dashboard</h2>
        <p>{error}</p>
        <button
          onClick={() => router.refresh()}
          className="mt-6 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const capitalizedView = view.charAt(0).toUpperCase() + view.slice(1);
  const attendanceList = showAbsent
    ? data[`absent${capitalizedView}`] ?? []
    : data[view] ?? [];

  // ✅ Apply search filter (by name or role)
  const filteredAttendance = attendanceList.filter(
    (entry) =>
      entry.name?.toLowerCase().includes(search.toLowerCase()) ||
      entry.role?.toLowerCase().includes(search.toLowerCase())
  );

  const sliderSettings = {
    dots: false,
    arrows: false,
    infinite: false,
    speed: 500,
    slidesToShow: 5,
    slidesToScroll: 1,
    draggable: true,
    swipeToSlide: true,
    responsive: [
      { breakpoint: 1280, settings: { slidesToShow: 4 } },
      { breakpoint: 1024, settings: { slidesToShow: 3 } },
      { breakpoint: 768, settings: { slidesToShow: 2 } },
      { breakpoint: 640, settings: { slidesToShow: 1 } },
    ],
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Sidebar */}
      <AdminSidebar setView={setView} setShowAbsent={setShowAbsent} />

      {/* Main Content */}
      <div className="ml-64 flex-1 flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white overflow-x-hidden">
        <AdminHeader showAbsent={"Dashboard"} />
        <main className="mt-16 p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-black min-h-screen text-white">
          {/* Weekly absentees slider */}
          <div className="m-4 max-w-full overflow-x-hidden">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold">📅 Weekly Absences (All)</h3>
              <button
                onClick={() =>
                  router.push("/admin/attendance/all?section=weekly")
                }
                className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition"
              >
                View All
              </button>
            </div>
            <Slider {...sliderSettings}>
              {(data?.absenteesWeek ?? []).map((student, idx) => (
                <div key={student.userId || idx} className="p-2 w-[200px]">
                  <div className="bg-red-600 rounded-lg p-4 shadow-lg text-white">
                    <h4 className="font-semibold">
                      {idx + 1}. {student.name || "Unknown"}
                    </h4>
                    <p className="text-sm">{student.role || "—"}</p>
                    <p className="mt-2 font-bold">
                      {student.absences ?? 0} days
                    </p>
                  </div>
                </div>
              ))}
            </Slider>
          </div>

          {/* Monthly absentees slider */}
          <div className="m-4 max-w-full overflow-x-hidden">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold">📆 Monthly Absences (All)</h3>
              <button
                onClick={() =>
                  router.push("/admin/attendance/all?section=monthly")
                }
                className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition"
              >
                View All
              </button>
            </div>
            <Slider {...sliderSettings}>
              {(data?.absenteesMonth ?? []).map((student, idx) => (
                <div key={student.userId || idx} className="p-2 w-[200px]">
                  <div className="bg-orange-600 rounded-lg p-4 shadow-lg text-white">
                    <h4 className="font-semibold">
                      {idx + 1}. {student.name || "Unknown"}
                    </h4>
                    <p className="text-sm">{student.role || "—"}</p>
                    <p className="mt-2 font-bold">
                      {student.absences ?? 0} days
                    </p>
                  </div>
                </div>
              ))}
            </Slider>
          </div>

          {/* Attendance Table with Search */}
          <div className="overflow-x-auto px-4 pb-6">
            <h2 className="text-2xl font-bold mb-4 text-center">
              {showAbsent ? "🚫 Absent Students" : "✅ Present Students"}
            </h2>

            {/* ✅ Search Bar */}
            <div className="flex justify-center mb-4">
              <input
                type="text"
                placeholder="🔍 Search by name or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-md p-2 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <AttendanceTable attendanceList={filteredAttendance} />
          </div>
        </main>
      </div>
    </div>
  );
}
