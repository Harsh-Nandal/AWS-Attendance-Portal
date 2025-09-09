// pages/success.js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SuccessPage() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [imageData, setImageData] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // attendance result fields
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [punchIn, setPunchIn] = useState(null);
  const [punchOut, setPunchOut] = useState(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [heading, setHeading] = useState("Attendance"); // dynamic heading

  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get("userId");
    const uname = params.get("name");
    const urole = params.get("role");
    const img = params.get("imageData") || params.get("imageUrl");
    // decide mode: "register" or "detection"
    const from = (params.get("from") || "").toLowerCase(); // expecting "register" or "detection"
    const mode = from === "register" ? "register" : "detection";

    if (!uid || !uname || !urole || !img) {
      alert("⚠️ Missing data. Please register / detect again.");
      router.push("/newStudent");
      return;
    }

    setUserId(uid);
    setName(uname);
    setRole(urole);
    setImageData(img);
    setHeading(mode === "register" ? "Registration Complete" : "Attendance");

    // run appropriate flow automatically
    (async function runFlow() {
      setLoading(false);
      // slight delay to allow UI paint
      await new Promise((r) => setTimeout(r, 200));
      if (mode === "register") {
        await runRegisterThenPunch({ name: uname, userId: uid, role: urole, imageData: img });
      } else {
        // detection/attendance flow
        await runPunchOnly({ userId: uid });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // decode data URLs if encoded
  let previewSrc = imageData;
  try {
    previewSrc = decodeURIComponent(imageData);
  } catch {
    previewSrc = imageData;
  }

  async function runRegisterThenPunch({ name, userId, role, imageData }) {
    setProcessing(true);
    setAttendanceMessage("");
    setAttendanceStatus("");
    setPunchIn(null);
    setPunchOut(null);

    try {
      // 1) Register user (server uploads to Cloudinary + tries to index Rekognition)
      const regResp = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, userId, role, imageData }),
      });

      const regJson = await regResp.json();

      if (!regResp.ok) {
        const msg = regJson?.message || regJson?.error || JSON.stringify(regJson);
        alert("Registration failed: " + msg);
        setProcessing(false);
        return;
      }

      const createdUser = regJson.user ?? regJson;
      if (!createdUser) {
        alert("Server returned no user data after register.");
        setProcessing(false);
        return;
      }

      if (regJson.rekognitionError) {
        // warn but continue
        setAttendanceMessage("Warning: Rekognition indexing failed: " + regJson.rekognitionError);
      }

      // 2) Submit attendance (punch) with the registered userId
      await runPunchOnly({ userId: String(createdUser.userId ?? userId) });
    } catch (err) {
      console.error("Network/server error:", err);
      alert("Network/server error. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  async function runPunchOnly({ userId }) {
    setProcessing(true);
    setAttendanceMessage("");
    setAttendanceStatus("");
    setPunchIn(null);
    setPunchOut(null);

    try {
      const attResp = await fetch("/api/submit-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: String(userId) }),
      });

      const attJson = await attResp.json();

      if (!attResp.ok) {
        const msg = attJson?.message || attJson?.error || JSON.stringify(attJson);
        alert("Attendance failed: " + msg);
        setProcessing(false);
        return;
      }

      // expected: { ok:true, status:"Punched In"|"Punched Out"|"Already Punched Out", punchIn, punchOut, recordedAt }
      const status = attJson.status || attJson.statusText || "Unknown";
      setAttendanceStatus(status);
      setPunchIn(attJson.punchIn || null);
      setPunchOut(attJson.punchOut || null);
      setAttendanceMessage(attJson.message || "");
    } catch (err) {
      console.error("Attendance error:", err);
      alert("Attendance error. Try again.");
    } finally {
      setProcessing(false);
    }
  }

  // show a simple loader block during processing
  function renderProcessing() {
    if (!processing) return null;
    return (
      <div className="my-4 text-sm text-gray-600 flex items-center justify-center gap-2">
        <svg className="animate-spin h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span>Processing...</span>
      </div>
    );
  }

  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString();

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4 py-6">
      <div className="bg-white shadow-xl rounded-2xl max-w-md w-full p-6 text-center border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-center gap-2">
          {heading}
        </h1>

        {previewSrc && (
          <div className="flex justify-center mb-4">
            <img
              src={previewSrc}
              alt="Captured Face"
              className="w-40 h-40 object-cover rounded-full border-4 border-blue-200 shadow-md"
            />
          </div>
        )}

        <div className="space-y-2 text-gray-700 text-left mb-4">
          <p>
            <span className="font-semibold">Name:</span> {name}
          </p>
          <p>
            <span className="font-semibold">ID:</span> {userId}
          </p>
          <p>
            <span className="font-semibold">Role:</span> {role}
          </p>
          <p>
            <span className="font-semibold">Date:</span> {date}
          </p>
          <p>
            <span className="font-semibold">Time:</span> {time}
          </p>
        </div>

        {attendanceMessage && (
          <div className="mb-4 text-sm text-yellow-700 bg-yellow-50 p-2 rounded">{attendanceMessage}</div>
        )}

        {renderProcessing()}

        {attendanceStatus ? (
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Attendance status:</div>
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-gray-100 text-gray-800">
              <span className="font-semibold">{attendanceStatus}</span>
              {punchIn && <span className="text-xs opacity-80">In: {punchIn}</span>}
              {punchOut && <span className="text-xs opacity-80">Out: {punchOut}</span>}
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          <Link
            href="/"
            className="inline-block w-full py-3 rounded-lg text-white font-medium bg-blue-500 hover:bg-blue-600 transition shadow-md"
          >
            🏠 Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
