"use client";
import Link from "next/link";
import { FaTachometerAlt, FaUserTimes } from "react-icons/fa";
import { usePathname } from "next/navigation";

export default function AdminSidebar({ setView, setShowAbsent }) {
  const pathname = usePathname();

  return (
    <aside
      className="
        fixed top-0 left-0 h-screen 
        w-64 bg-gradient-to-b from-white via-gray-100 to-gray-200 
        text-gray-800 flex flex-col shadow-lg z-50
      "
    >
      <div className="p-6 flex items-center gap-3 border-b border-gray-300">
        {/* Logo */}
        <img
          src="/DesinerzAcademyDark.png"
          alt="Logo"
          className="w-full h-auto mb-4 drop-shadow-lg"
        />
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {/* Dashboard button */}
        <Link
          href={"/admin/dashboard"}
          onClick={() => setShowAbsent(false)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg 
                     bg-gradient-to-r from-gray-700 to-gray-900 
                     hover:from-gray-600 hover:to-gray-800 
                     transition text-white font-medium shadow-md"
        >
          <FaTachometerAlt /> Dashboard
        </Link>

        {/* Absent Today button: only visible on /admin/dashboard */}
        {pathname === "/admin/dashboard" && (
          <button
            onClick={() => setShowAbsent(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg 
                       bg-gradient-to-r from-red-500 to-red-600 
                       hover:from-red-400 hover:to-red-500 
                       transition text-white font-medium shadow-md"
          >
            <FaUserTimes /> Absent Today
          </button>
        )}

        {/* Records link */}
        <Link
          href={"/admin/records"}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg 
                     bg-gradient-to-r from-red-500 to-red-600 
                     hover:from-red-400 hover:to-red-500 
                     transition text-white font-medium shadow-md"
        >
          <FaUserTimes /> Records
        </Link>
      </nav>
    </aside>
  );
}
