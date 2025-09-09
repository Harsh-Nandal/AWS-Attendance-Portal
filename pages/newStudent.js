"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../styles/Register.module.css";

export default function Register() {
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("student");
  const [imageData, setImageData] = useState("");
  const [loading, setLoading] = useState(false);
  const [faceNotFound, setFaceNotFound] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const router = useRouter();

  function generateUniqueId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  useEffect(() => {
    let mounted = true;
    setUserId((prev) => (prev && prev.length ? prev : generateUniqueId()));

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!mounted) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera start error:", err);
        alert("Could not access camera. Please allow camera permissions.");
      }
    })();

    return () => {
      mounted = false;
      stopStream();
    };
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImageData(dataUrl);
    stopStream();
    return dataUrl;
  };

  const retake = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setImageData("");
      setFaceNotFound(false);
    } catch (err) {
      console.error("Retake camera error:", err);
      alert("Could not access camera. Please allow camera permissions.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !userId || !imageData) {
      alert("⚠️ Please ensure name, ID and a captured image are present.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, userId, role, imageData }),
      });

      const json = await res.json();

      if (res.ok) {
        if (json.rekognitionError) {
          alert("Registered, but Rekognition indexing failed: " + json.rekognitionError);
        }
        router.push({
          pathname: "/success",
          query: { name, role, imageData, userId },
        });
      } else {
        const msg = json?.message || "Registration failed";
        alert("Server error: " + msg);
      }
    } catch (err) {
      console.error("Network error:", err);
      alert("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-6">
        {loading ? (
          <div className={styles.loader}>Submitting...</div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-center mb-4 text-gray-800">
              Register Student / Faculty
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-lg focus:ring focus:outline-none"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              {/* ID Field */}
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-lg focus:ring focus:outline-none"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                title="Unique ID (auto-generated, editable)"
              />

              {/* Role */}
              <select
                className="w-full px-3 py-2 border rounded-lg focus:ring focus:outline-none"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
              </select>

              {/* Camera */}
              <div className="w-full flex flex-col items-center">
                {!imageData ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full max-w-sm rounded-lg border shadow-sm aspect-video object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex gap-3 mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDetecting(true);
                          const ok = captureImage();
                          setDetecting(false);
                          if (!ok) setFaceNotFound(true);
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow"
                      >
                        📸 Capture
                      </button>
                      <button
                        type="button"
                        onClick={stopStream}
                        className="bg-gray-200 px-4 py-2 rounded-lg"
                      >
                        Stop
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <img
                      src={imageData}
                      alt="Captured"
                      className="w-full max-w-sm rounded-lg border shadow-md object-cover aspect-video"
                    />
                    <div className="flex gap-3 mt-3">
                      <button
                        type="button"
                        onClick={retake}
                        className="bg-yellow-500 px-4 py-2 rounded-lg shadow"
                      >
                        🔁 Retake
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImageData("");
                          retake();
                        }}
                        className="bg-gray-200 px-4 py-2 rounded-lg"
                      >
                        Clear
                      </button>
                    </div>
                  </>
                )}
              </div>

              {faceNotFound && (
                <p className="text-red-600 text-sm mt-2 text-center">
                  ⚠️ Face not detected. Please retake with better lighting.
                </p>
              )}

              <button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg shadow transition"
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
