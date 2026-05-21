import bcrypt from "bcrypt";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

const SEED_USERS = [
  {
    username: "compliance.officer",
    password: "CO@RegRadar2026",
    role: "CO" as const,
    department_name: null,
    email: "co@regradar.com",
  },
  {
    username: "it.dept",
    password: "IT@RegRadar2026",
    role: "DEPARTMENT" as const,
    department_name: "IT Dept",
    email: "it@regradar.com",
  },
  {
    username: "retail.banking",
    password: "RB@RegRadar2026",
    role: "DEPARTMENT" as const,
    department_name: "Retail Banking",
    email: "retail@regradar.com",
  },
  {
    username: "legal.dept",
    password: "Legal@RegRadar2026",
    role: "DEPARTMENT" as const,
    department_name: "Legal Dept",
    email: "legal@regradar.com",
  },
  {
    username: "operations",
    password: "Ops@RegRadar2026",
    role: "DEPARTMENT" as const,
    department_name: "Operations",
    email: "ops@regradar.com",
  },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB for seeding");

  for (const u of SEED_USERS) {
    const existing = await User.findOne({ username: u.username });
    if (existing) {
      console.log(`⏭️  Skipping ${u.username} (already exists)`);
      continue;
    }
    const password_hash = await bcrypt.hash(u.password, 12);
    await User.create({ ...u, password_hash });
    console.log(`✅ Seeded user: ${u.username} [${u.role}]`);
  }

  console.log("\n📋 Seed Summary:");
  console.log("┌─────────────────────────┬──────────────────────┬──────────────────────┐");
  console.log("│ Username                │ Password             │ Role                 │");
  console.log("├─────────────────────────┼──────────────────────┼──────────────────────┤");
  SEED_USERS.forEach(u => {
    const un = u.username.padEnd(23);
    const pw = u.password.padEnd(20);
    const r = (u.department_name || "CO").padEnd(20);
    console.log(`│ ${un} │ ${pw} │ ${r} │`);
  });
  console.log("└─────────────────────────┴──────────────────────┴──────────────────────┘");

  await mongoose.disconnect();
  console.log("\n✅ Seeding complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
