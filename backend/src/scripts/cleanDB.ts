import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

async function clean() {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ FATAL ERROR: Wiping the database is strictly forbidden in production!");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");
  
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
    console.log("✅ Dropped database 'regradar'");
  }
  
  await mongoose.disconnect();
  console.log("✅ Cleanup complete!");
}

clean().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
