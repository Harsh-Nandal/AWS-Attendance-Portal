"use client";
import { FaCalendarDay, FaCalendarWeek, FaCalendarAlt } from "react-icons/fa";

export default function DashboardTabs({ view, setView, data }) {
  const tabs = [
    { type: "daily", label: "Daily", icon: <FaCalendarDay />, color: "from-yellow-500 to-yellow-600" },
    { type: "weekly", label: "Weekly", icon: <FaCalendarWeek />, color: "from-green-500 to-green-600" },
    { type: "monthly", label: "Monthly", icon: <FaCalendarAlt />, color: "from-blue-500 to-blue-600" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-6">
      {tabs.map(({ type, label, icon, color }) => (
        <div
          key={type}
          onClick={() => setView(type)}
          className={`cursor-pointer flex items-center gap-3 p-6 rounded-xl shadow-lg transition hover:scale-105 ${
            view === type
              ? `bg-gradient-to-r ${color} text-white`
              : "bg-gray-100 hover:bg-gray-200 text-gray-800"
          }`}
        >
          <div
            className={`p-3 rounded-lg text-xl shadow-md ${
              view === type ? "bg-white text-gray-800" : "bg-gray-300 text-gray-800"
            }`}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-lg font-bold">{data[type]?.length || 0} Records</p>
          </div>
        </div>
      ))}
    </div>
  );
}
