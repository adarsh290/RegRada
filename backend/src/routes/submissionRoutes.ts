import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  submitProof,
  getSubmissions,
  getSubmissionsByCircular,
} from "../controllers/submissionController";

// ── Multer Storage ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".txt", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, TXT, DOC, and DOCX files are allowed"));
    }
  },
});

const router = Router();

// POST /api/submissions — upload proof of compliance
router.post("/", upload.single("proof_file"), submitProof);

// GET /api/submissions — fetch submissions (optional ?department=)
router.get("/", getSubmissions);

// GET /api/submissions/circular/:circularId — fetch by circular
router.get("/circular/:circularId", getSubmissionsByCircular);

export default router;
