// pages/error.js
import { useRouter } from "next/router";

export default function ErrorPage() {
  const router = useRouter();
  const { message } = router.query;

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>❌ Something Went Wrong</h1>
      <p>{message || "An unexpected error occurred."}</p>
      <button onClick={() => router.push("/")}>Go Home</button>
    </div>
  );
}
