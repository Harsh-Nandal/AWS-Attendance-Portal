"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SuccessPage() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [imageData, setImageData] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [error, setError] = useState("");

  const router = useRouter();
  const alreadySubmittedRef = useRef(false);

  const safeParseJson = async (resp) => {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  };

  const submitAttendance = async ({ userId, name, role, imageData }) => {
    if (submitting || alreadySubmittedRef.current) return;

    if (!userId || !name || !role || !imageData) {
      setError("Missing data. Please register again.");
      return;
    }

    alreadySubmittedRef.current = true;
    setSubmitting(true);
    setError("");
    setAttendanceResult(null);

    try {
      const resp = await fetch("/api/submit-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name, role, imageData }),
      });

      const data = await safeParseJson(resp);

      if (!resp.ok) {
        // handle 429/400/500 etc
        const message = data?.message || `Server returned ${resp.status}`;
        setError(message);
        // if server returned a partial attendance object, show it
        if (data && data.status) setAttendanceResult(data);
      } else {
        setAttendanceResult(data);
      }
    } catch (err) {
      console.error("Submit attendance error:", err);
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        alreadySubmittedRef.current = false;
      }, 5000);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const uid = params.get("userId");
        const uname = params.get("name");
        const urole = params.get("role");
        const img = params.get("imageData");

        if (uid && uname && urole && img) {
          setUserId(uid);
          setName(uname);
          setRole(urole);
          setImageData(img);

          await submitAttendance({ userId: uid, name: uname, role: urole, imageData: img });
        } else {
          alert("⚠️ Missing data. Please register again.");
          router.push("/");
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-lg font-medium text-gray-600">Loading...</p>
      </main>
    );
  }

  let previewSrc = imageData;
  try {
    previewSrc = decodeURIComponent(imageData);
  } catch {
    previewSrc = imageData;
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4 py-6">
      <div className="bg-white shadow-xl rounded-2xl max-w-md w-full p-6 text-center border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center justify-center gap-2">
          🎉 Attendance Details
        </h1>

        {imageData && (
          <div className="flex justify-center mb-4">
            <img
              src={previewSrc}
              alt="Captured Face"
              className="w-40 h-40 object-cover rounded-full border-4 border-blue-200 shadow-md"
            />
          </div>
        )}

        <div className="space-y-2 text-gray-700 text-left mb-6">
          <p><span className="font-semibold">Name:</span> {name}</p>
          <p><span className="font-semibold">ID:</span> {userId}</p>
          <p><span className="font-semibold">Role:</span> {role}</p>
        </div>

        {attendanceResult ? (
          <div className="text-left bg-gray-50 p-4 rounded-md mb-4 border">
            <p className="font-semibold text-sm mb-2">Status: {attendanceResult.status}</p>
            <p className="text-sm"><span className="font-medium">Date:</span> {attendanceResult.date ?? "—"}</p>
            <p className="text-sm"><span className="font-medium">Punch In:</span> {attendanceResult.punchIn ?? "—"}</p>
            <p className="text-sm"><span className="font-medium">Punch Out:</span> {attendanceResult.punchOut ?? "—"}</p>
            {attendanceResult.duration && <p className="text-sm"><span className="font-medium">Duration:</span> {attendanceResult.duration}</p>}
            {attendanceResult.message && <p className="text-xs text-gray-600 mt-2">{attendanceResult.message}</p>}
          </div>
        ) : (
          <div className="text-left bg-transparent p-1 mb-4">
            <p className="text-sm text-gray-500">{submitting ? "⏳ Punching attendance..." : "Recording attendance..."}</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <Link href="/" className="mt-4 inline-block text-blue-500 hover:underline text-sm font-medium">🏠 Back to Home</Link>
      </div>
    </main>
  );
}
