"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../components/AdminSidebar";
import AdminHeader from "../../components/AdminHeader";
import DashboardTabs from "../../components/DashboardTabs";
import AttendanceTable from "../../components/AttendanceTable";

export default function RecordsPage() {
  const [data, setData] = useState({
    daily: [],
    weekly: [],
    monthly: [],
    absentDaily: [],
    absentWeekly: [],
    absentMonthly: [],
  });
  const [view, setView] = useState("daily");
  const [showAbsent, setShowAbsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
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
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch("/api/admin/attendance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authChecked]);

  const capitalizedView = view.charAt(0).toUpperCase() + view.slice(1);
  const attendanceList = showAbsent
    ? data[`absent${capitalizedView}`] ?? []
    : data[view] ?? [];

  if (!authChecked || loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-gray-800"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar setView={setView} setShowAbsent={setShowAbsent} />

      <div className="ml-64 flex-1 flex flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <AdminHeader showAbsent={"Records"} />
        <main className="mt-16 p-6 bg-gradient-to-br from-gray-900 via-gray-800 to-black min-h-screen text-white">
          <DashboardTabs view={view} setView={setView} data={data} />
          <AttendanceTable attendanceList={attendanceList} />
        </main>
      </div>
    </div>
  );
}
