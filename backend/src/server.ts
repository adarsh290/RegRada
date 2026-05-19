import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import circularRoutes from "./routes/circularRoutes";
import submissionRoutes from "./routes/submissionRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Static Files (uploaded proofs) ─────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── Health Check ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "regradar-backend" });
});

// ── Routes ─────────────────────────────────────────────────
app.use("/api/circulars", circularRoutes);
app.use("/api/submissions", submissionRoutes);

// ── Database & Start ───────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

start();
