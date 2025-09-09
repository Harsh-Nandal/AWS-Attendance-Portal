const mongoose = require("mongoose")

const AdminUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: "Admin",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Avoid recompilation error in Next.js hot reloads
module.exports = mongoose.models?.AdminUser || mongoose.model("AdminUser", AdminUserSchema);
