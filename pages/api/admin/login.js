import bcrypt from "bcryptjs";
import connectDB from "../../../lib/mongodb";
import AdminUser from "../../../models/AdminUser";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  await connectDB();

  const { email, password } = req.body;

  try {
    const user = await AdminUser.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid email or password" });

    // ✅ Use exact token from .env
    const token = process.env.ADMIN_TOKEN;
    if (!token)
      return res
        .status(500)
        .json({ error: "Server error: ADMIN_TOKEN not set in .env" });

    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error("Login API error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
