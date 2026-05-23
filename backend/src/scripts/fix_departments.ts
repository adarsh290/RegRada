import mongoose from "mongoose";
import dotenv from "dotenv";
import Circular from "../models/Circular";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

function normalizeDepartment(dept: string): string {
  if (!dept) return "Unknown";
  const trimmed = dept.trim().toLowerCase();
  
  if (trimmed === "it" || trimmed === "it dept" || trimmed === "it department" || trimmed.includes("information technology")) {
    return "IT Dept";
  }
  if (trimmed === "retail" || trimmed.includes("retail banking")) {
    return "Retail Banking";
  }
  if (trimmed === "legal" || trimmed === "legal dept" || trimmed === "legal department" || trimmed === "law") {
    return "Legal Dept";
  }
  if (trimmed === "operations" || trimmed === "operation" || trimmed === "ops") {
    return "Operations";
  }
  if (trimmed === "compliance" || trimmed === "compliance officer" || trimmed === "co" || trimmed === "compliance dept" || trimmed === "compliance department") {
    return "Compliance Officer";
  }
  
  const words = trimmed.split(/[^a-z0-9]+/);
  if (words.includes("compliance")) return "Compliance Officer";
  if (words.includes("it") || words.includes("information") || words.includes("technology")) return "IT Dept";
  if (words.includes("retail")) return "Retail Banking";
  if (words.includes("legal") || words.includes("law")) return "Legal Dept";
  if (words.includes("operations") || words.includes("operation")) return "Operations";

  return dept;
}

async function fix() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");
  
  const circulars = await Circular.find();
  for (const c of circulars) {
    let changed = false;
    for (const map of c.maps) {
      const newDept = normalizeDepartment(map.department);
      if (map.department !== newDept || map.assigned_to !== newDept) {
        map.department = newDept;
        map.assigned_to = newDept;
        changed = true;
      }
    }
    if (changed) {
      await c.save();
      console.log(`Fixed departments for circular ${c._id}`);
    }
  }
  
  await mongoose.disconnect();
  console.log("✅ Fix complete!");
}

fix().catch((err) => {
  console.error("❌ Fix failed:", err);
  process.exit(1);
});
