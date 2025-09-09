// lib/mongodb.js
const mongoose = require("mongoose");

const connectDB = async () => {
  if (mongoose.connections[0]?.readyState) return;
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not defined in environment");
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
};

module.exports = connectDB;
