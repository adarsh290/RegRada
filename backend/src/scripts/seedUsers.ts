import bcrypt from "bcrypt";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/User";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

if (process.env.NODE_ENV === "production") {
  console.error("❌ ERROR: Database seeding is disabled in production environments.");
  process.exit(1);
}

const getPassword = (envVar: string): string => {
  const pwd = process.env[envVar];
  if (!pwd) {
    console.error(`❌ ERROR: Missing required environment variable ${envVar} for seeding.`);
    process.exit(1);
  }
  return pwd;
};

const SEED_USERS = [
  {
    username: "compliance.officer",
    password: getPassword("DEFAULT_CO_PASSWORD"),
    role: "CO" as const,
    department_name: null,
    email: "co@regradar.com",
  },
  {
    username: "it.dept",
    password: getPassword("DEFAULT_IT_PASSWORD"),
    role: "DEPARTMENT" as const,
    department_name: "IT Dept",
    email: "it@regradar.com",
  },
  {
    username: "retail.banking",
    password: getPassword("DEFAULT_RETAIL_PASSWORD"),
    role: "DEPARTMENT" as const,
    department_name: "Retail Banking",
    email: "retail@regradar.com",
  },
  {
    username: "legal.dept",
    password: getPassword("DEFAULT_LEGAL_PASSWORD"),
    role: "DEPARTMENT" as const,
    department_name: "Legal Dept",
    email: "legal@regradar.com",
  },
  {
    username: "operations",
    password: getPassword("DEFAULT_OPS_PASSWORD"),
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
  console.log("┌─────────────────────────┬──────────────────────┐");
  console.log("│ Username                │ Role                 │");
  console.log("├─────────────────────────┼──────────────────────┤");
  SEED_USERS.forEach(u => {
    const un = u.username.padEnd(23);
    const r = (u.department_name || "CO").padEnd(20);
    console.log(`│ ${un} │ ${r} │`);
  });
  console.log("└─────────────────────────┴──────────────────────┘");

  await mongoose.disconnect();
  console.log("\n✅ Seeding complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
