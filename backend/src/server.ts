import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import fs from "fs";
import mime from "mime-types";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import cookieParser from "cookie-parser";
import { authenticate } from "./middleware/authMiddleware";
import circularRoutes from "./routes/circularRoutes";
import submissionRoutes from "./routes/submissionRoutes";
import sourceRoutes from "./routes/sourceRoutes";
import authRoutes from "./routes/authRoutes";
import { startCronService } from "./services/cronService";
import Submission from "./models/Submission";
import { AuthPayload } from "./middleware/authMiddleware";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
  process.exit(1);
}

if (!process.env.INTERNAL_API_KEY) {
  console.error("FATAL ERROR: INTERNAL_API_KEY environment variable is not set.");
  process.exit(1);
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
try {
  const parsedUrl = new URL(AI_SERVICE_URL);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Invalid protocol");
  }
} catch (err) {
  console.error("FATAL ERROR: AI_SERVICE_URL is invalid or uses an unsupported protocol.");
  process.exit(1);
}

// Global Request Interceptor to automatically attach X-Internal-Token for all Backend -> AI Service requests
axios.interceptors.request.use(config => {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
  if (config.url && config.url.startsWith(AI_SERVICE_URL)) {
    config.headers = config.headers || {};
    config.headers["X-Internal-Token"] = process.env.INTERNAL_API_KEY;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/regradar";

// ── Middleware ──────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",");
app.use(
  cors({
    origin: (origin, callback) => {
      // BUG-BE2-029: Removed !origin bypass to strictly enforce allowed origins
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS policy blocks requests from origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(helmet());
app.use(mongoSanitize());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" })); // BUG-SEC-034: Increase limit to 2mb

// ── Rate Limiting ───────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts from this IP, please try again after 15 minutes" },
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
});

// Apply global rate limiter to all API endpoints
app.use("/api", globalLimiter);
// BUG-SEC-004: Apply stricter rate limiter specifically to login, register, and logout
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/logout", authLimiter);

// ── Secure File Streaming Endpoint (uploaded proofs) ───────────
app.get("/api/files/:filename", authenticate, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, "../uploads", filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const user = (req as any).user as AuthPayload;
    if (user.role === "DEPARTMENT") {
      // BUG-SEC-010: Use exact $eq match instead of unanchored $regex to prevent IDOR
      // An unanchored regex like /proof-100/ would also match proof-1002345.pdf
      const hasAccess = await Submission.exists({
        "proof_files.file_path": { $eq: path.join(__dirname, "../uploads", filename) },
        department: user.department_name
      });
      if (!hasAccess) {
        res.status(403).json({ error: "Access denied: file does not belong to your department" });
        return;
      }
    }

    // BUG-SEC-009: Set explicit Content-Type and force download to prevent MIME-sniff XSS
    const mimeType = (mime.lookup(filename) as string) || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      console.error("File stream error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream file" });
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error("File route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Health Check ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "regradar-backend" });
});

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/circulars", circularRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/sources", sourceRoutes);

// ── Database & Start ───────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");
    startCronService();
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

start();
