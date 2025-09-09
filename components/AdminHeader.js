"use client";
import { FaSignOutAlt } from "react-icons/fa";
import { useRouter } from "next/navigation";

export default function AdminHeader({ showAbsent }) {
  const router = useRouter();

  return (
    <header className="fixed top-0 left-64 right-0 z-50 bg-gradient-to-r from-gray-800 to-gray-700 shadow-sm p-4 flex justify-between items-center border-b border-gray-700">
      {/* ✅ Title */}
      <h1 className="text-xl font-semibold capitalize text-white">
        {showAbsent ? showAbsent : "Dashboard"}
      </h1>

      {/* ✅ Logout Button */}
      <button
        onClick={() => {
          localStorage.removeItem("adminToken");
          router.replace("/admin/login");
        }}
        className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition"
      >
        <FaSignOutAlt /> Logout
      </button>
    </header>
  );
}
