import bcrypt from "bcrypt";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User";
import Circular from "../models/Circular";
import Submission from "../models/Submission";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

const DEMO_ACCOUNTS = [
  { username: "compliance.officer", password: "Admin@123" },
  { username: "it.dept",            password: "Dept@123" },
  { username: "retail.banking",     password: "Dept@123" },
  { username: "legal.dept",         password: "Dept@123" },
  { username: "operations",         password: "Dept@123" },
];

async function resetDemo() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  // ── 1. Reset passwords ──────────────────────────────────
  console.log("\n🔑 Resetting user passwords...");
  for (const acct of DEMO_ACCOUNTS) {
    const user = await User.findOne({ username: acct.username });
    if (!user) {
      console.log(`  ⚠️  User '${acct.username}' not found — creating...`);
      // Create the user if they don't exist
      const role = acct.username === "compliance.officer" ? "CO" : "DEPARTMENT";
      const deptMap: Record<string, string | null> = {
        "compliance.officer": null,
        "it.dept": "IT Dept",
        "retail.banking": "Retail Banking",
        "legal.dept": "Legal Dept",
        "operations": "Operations",
      };
      const password_hash = await bcrypt.hash(acct.password, 12);
      await User.create({
        username: acct.username,
        password_hash,
        role,
        department_name: deptMap[acct.username],
        email: `${acct.username.replace('.', '')}@regradar.com`,
      });
      console.log(`  ✅ Created '${acct.username}' with password '${acct.password}'`);
    } else {
      user.password_hash = await bcrypt.hash(acct.password, 12);
      await user.save();
      console.log(`  ✅ Reset '${acct.username}' → password: '${acct.password}'`);
    }
  }

  // ── 2. Clear circulars & submissions ─────────────────────
  console.log("\n🗑️  Clearing existing data...");
  const circDeleted = await Circular.deleteMany({});
  const subDeleted = await Submission.deleteMany({});
  console.log(`  ✅ Deleted ${circDeleted.deletedCount} circulars`);
  console.log(`  ✅ Deleted ${subDeleted.deletedCount} submissions`);

  // ── 3. Summary ──────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║            🎯 DEMO RESET COMPLETE                   ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║ Login Credentials:                                  ║");
  console.log("║   CO:      compliance.officer / Admin@123           ║");
  console.log("║   IT:      it.dept / Dept@123                       ║");
  console.log("║   Retail:  retail.banking / Dept@123                ║");
  console.log("║   Legal:   legal.dept / Dept@123                    ║");
  console.log("║   Ops:     operations / Dept@123                    ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║ Database: Clean slate (0 circulars, 0 submissions)  ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  await mongoose.disconnect();
}

resetDemo().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
