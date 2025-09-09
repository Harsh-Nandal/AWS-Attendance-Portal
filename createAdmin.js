// require('dotenv').config();
// const bcrypt = require("bcryptjs");
// const connectDB = require("./lib/mongodb");
// const AdminUser = require("./models/AdminUser");

// async function createAdmin() {
//   await connectDB();

//   const email = "admin@example.com";
//   const plainPassword = "admin123";

//   const salt = await bcrypt.genSalt(10);
//   const passwordHash = await bcrypt.hash(plainPassword, salt);

//   const existing = await AdminUser.findOne({ email });
//   if (existing) {
//     console.log("Admin user already exists.");
//     process.exit(0);
//   }

//   const admin = new AdminUser({
//     email,
//     passwordHash,
//     name: "Super Admin",
//   });

//   await admin.save();
//   console.log("Admin user created successfully.");
//   process.exit(0);
// }

// createAdmin().catch(console.error);
