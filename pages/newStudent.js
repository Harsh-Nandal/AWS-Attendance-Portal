"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../styles/Register.module.css";

/**
 * Register page (client)
 * - Captures a photo (dataURL)
 * - Sends { name, userId, role, imageData } to /api/register
 * - Server should upload to Cloudinary and index into Rekognition
 */

export default function Register() {
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("student");
  const [imageData, setImageData] = useState("");
  const [loading, setLoading] = useState(false);
  const [faceNotFound, setFaceNotFound] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const router = useRouter();

  // generate a compact unique id: timestamp + random suffix (readable & unique)
  function generateUniqueId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Start camera on mount and generate an initial userId
  useEffect(() => {
    let mounted = true;

    // generate once on mount if not set
    setUserId((prev) => (prev && prev.length ? prev : generateUniqueId()));

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (!mounted) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  // Capture current frame to dataURL and set state
  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext("2d");
    // size canvas to actual video size for better capture
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // quick heuristic: ensure face likely large enough by checking drawn size
    // (we cannot detect face without face-api now; so rely on user guidance)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImageData(dataUrl);
    // stop camera to save resources
    stopStream();
    return dataUrl;
  };

  // Allow user to retake: re-open camera
  const retake = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
      setImageData("");
      setFaceNotFound(false);
    } catch (err) {
      console.error("Retake camera error:", err);
      alert("Could not access camera. Please allow camera permissions.");
    }
  };

  // Copy userId to clipboard
  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      alert("ID copied to clipboard");
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = userId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
      alert("ID copied to clipboard");
    }
  };

  // Regenerate a new unique id (keeps editable)
  const handleRegenerateId = () => {
    setUserId(generateUniqueId());
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
        // server will upload to Cloudinary and call Rekognition
        body: JSON.stringify({ name, userId, role, imageData }),
      });

      const json = await res.json();

      if (res.ok) {
        if (json.rekognitionError) {
          // user created but Rekognition indexing failed
          alert("Registered, but Rekognition indexing failed: " + json.rekognitionError);
        } else {
          // success
          console.log("Registered user:", json.user ?? json);
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
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-100 overflow-auto p-4">
      {loading ? (
        <div className={styles.loader}>Submitting...</div>
      ) : (
        <>
          <h2 className={styles.heading}>Register Student / Faculty</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            {/* GENERATED UNIQUE ID (editable) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
              <input
                type="text"
                className={styles.inputField}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                title="Unique ID (auto-generated, editable)"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleCopyId}
                className="px-3 py-2 bg-gray-200 rounded"
                title="Copy ID"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleRegenerateId}
                className="px-3 py-2 bg-gray-200 rounded"
                title="Generate new ID"
              >
                Regenerate
              </button>
            </div>

            <select
              className={styles.inputField}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>

            <div className={styles.camera}>
              {!imageData ? (
                <>
                  <video ref={videoRef} width="320" height="240" autoPlay muted className="rounded" />
                  <canvas ref={canvasRef} style={{ display: "none" }} />
                  <div className="flex gap-3 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDetecting(true);
                        const ok = captureImage();
                        setDetecting(false);
                        if (!ok) setFaceNotFound(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      📸 Capture Image
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // cancel / stop camera
                        stopStream();
                      }}
                      className="bg-gray-200 px-4 py-2 rounded"
                    >
                      Stop Camera
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <img src={imageData} alt="Captured" className={styles.preview} />
                  <div className="flex gap-3 mt-3">
                    <button type="button" onClick={retake} className="bg-yellow-500 px-4 py-2 rounded">
                      🔁 Retake
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // clear preview and reopen camera
                        setImageData("");
                        retake();
                      }}
                      className="bg-gray-200 px-4 py-2 rounded"
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>

            {faceNotFound && (
              <p className="text-red-600 text-sm mt-2">
                ⚠️ Face not detected on capture. Please retake with better lighting or closer framing.
              </p>
            )}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Submitting..." : "Submit"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
