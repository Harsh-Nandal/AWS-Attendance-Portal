"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Home() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);
  const detectTimer = useRef(null);
  const runningDetection = useRef(false);
  const router = useRouter();

  const handleClose = () => setShowPopup(false);

  // Start video stream (camera)
  useEffect(() => {
    let currentStream;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setVideoReady(true);
            videoRef.current?.play?.();
          };
        }
      } catch (err) {
        console.error("🎥 Camera error:", err);
        alert("Could not access camera. Please allow camera permissions.");
      }
    })();

    return () => {
      if (detectTimer.current) clearInterval(detectTimer.current);
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const handleAppInstalled = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choice) => {
        if (choice.outcome === "accepted") {
          setInstallPrompt(null);
          setIsInstalled(true);
        }
      });
    }
  };

  // capture one frame from the video as JPEG dataURL
  const captureImage = () => {
    const canvas = document.createElement("canvas");
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  // Main attendance handler — send image to server which will call Rekognition
  const handleAttendance = async () => {
    // prevent overlapping runs
    if (runningDetection.current) {
      console.warn("⚠️ Detection already running — skipping");
      return;
    }
    runningDetection.current = true;
    setLoading(true);

    try {
      if (!videoReady) {
        console.warn("⚠️ Video not ready yet", { videoReady });
        return;
      }

      console.log("▶️ Capturing image for Rekognition...");

      const imageData = captureImage();

      console.log("📤 Sending image to backend for verification...");
      const res = await fetch("/api/verify-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });

      const result = await res.json();
      console.log("💻 Verification result from server:", result);

      const serverDistance =
        typeof result?.distance === "number"
          ? result.distance
          : typeof result?.matchDistance === "number"
          ? result.matchDistance
          : null;

      console.log("📏 Server distance:", serverDistance);

      // You can tune this threshold according to what your server returns.
      // If your server uses Rekognition similarity (0-100) you may need to convert/adjust.
      const distanceOk = serverDistance === null ? true : serverDistance < 0.45;

      if (result.success && result.user && distanceOk) {
        const { name, role, userId, imageUrl } = result.user;
        console.log("🎯 Match confirmed:", { name, role, userId });

        localStorage.setItem("uid", userId);

        // Optional: notify Telegram (ignore errors)
        fetch("/api/send-telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, role, userId, imageData }),
        }).catch(() => {});

        const url = `/success?name=${encodeURIComponent(
          name
        )}&role=${encodeURIComponent(role)}&userId=${encodeURIComponent(
          userId
        )}&image=${encodeURIComponent(imageUrl || "")}&imageData=${encodeURIComponent(
          imageData
        )}`;

        console.log("➡️ Redirecting to:", url);
        router.push(url);
      } else {
        console.warn("⚠️ User not recognized or distance too high", {
          serverDistance,
          result,
        });
        setShowPopup(true);
      }
    } catch (err) {
      console.error("❌ Error during face recognition:", err);
      alert("Error occurred during attendance.");
    } finally {
      setLoading(false);
      runningDetection.current = false;
      console.log("🔄 Detection cycle completed");
    }
  };

  // Optional: auto-run attendance every N ms — disabled by default to avoid frequent server calls.
  // If you want auto-detect, set enableAutoDetect = true and tune the interval.
  useEffect(() => {
    const enableAutoDetect = false; // set to true if you want periodic auto-checks
    const intervalMs = 2500;
    if (!enableAutoDetect) return;

    if (detectTimer.current) clearInterval(detectTimer.current);

    detectTimer.current = setInterval(() => {
      if (!loading && !showPopup && document.visibilityState === "visible") {
        handleAttendance();
      }
    }, intervalMs);

    return () => {
      if (detectTimer.current) clearInterval(detectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, showPopup]);

  return (
    <main className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-200 p-6 text-center relative">
      {/* Popup */}
      {showPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-6 rounded-2xl shadow-lg w-80 relative">
            <button
              onClick={handleClose}
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-lg"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Welcome!</h2>
            <p className="text-gray-600 mb-4">
              Not recognized with high confidence.
              <br />
              Please choose your option:
            </p>
            <div className="flex gap-3">
              <Link href="/newStudent" className="flex-1">
                <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition">
                  New Student
                </button>
              </Link>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-300 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Already Registered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo */}
      <img
        src="/DesinerzAcademyDark.png"
        alt="Logo"
        className="w-100 h-auto mb-4 drop-shadow-lg"
      />

      {/* Camera Feed with Loader */}
      <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-blue-500 shadow-lg mb-4 flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover rounded-full"
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-72 h-72 flex items-center justify-center">
              <span className="absolute w-64 h-64 rounded-full border-4 border-white animate-border-pulse"></span>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-6 leading-snug">
        Welcome <br /> to <br /> DESINERZ ACADEMY
      </h2>

      <button
        onClick={handleAttendance}
        disabled={loading || !videoReady}
        className="bg-green-600 text-white px-6 py-3 rounded-lg text-lg shadow hover:bg-green-700 transition disabled:bg-green-400 mb-4"
      >
        {loading ? "Detecting..." : "Mark Your Daily Attendance"}
      </button>

      {!isInstalled && installPrompt && (
        <button
          onClick={handleInstall}
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg shadow hover:bg-indigo-700 transition"
        >
          Install App
        </button>
      )}
    </main>
  );
}
