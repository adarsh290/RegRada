import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import {
  submitProof,
  getSubmissions,
  getSubmissionsByCircular,
  overrideSubmissionVerdict,
} from "../controllers/submissionController";
import { authenticate, requireCO } from "../middleware/authMiddleware";

// ── Multer Storage ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },
  filename: (_req, file, cb) => {
    // BUG-BE2-026: Use crypto.randomUUID() instead of Math.random()
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    // BUG-SEC-011: Ensure extension is valid, fallback to mime-type extension
    let ext = path.extname(file.originalname);
    if (!ext) {
      const mimeExt = require("mime-types").extension(file.mimetype);
      ext = mimeExt ? `.${mimeExt}` : ".bin";
    }
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
  fileFilter: (_req, file, cb) => {
    const allowedExts = [".pdf", ".txt", ".doc", ".docx"];
    const allowedMimeTypes = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, TXT, DOC, and DOCX files are allowed with valid MIME types"));
    }
  },
});

const router = Router();

// POST /api/submissions — upload proof of compliance (up to 5 files)
router.post(
  "/",
  authenticate,
  (req, res, next) => {
    upload.array("proof_files", 5)(req, res, (err) => {
      // BUG-BE2-024: Catch Multer errors and return 400 instead of 500 html/crashing
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  submitProof
);

// GET /api/submissions — fetch submissions (optional ?department=)
router.get("/", authenticate, getSubmissions);

// GET /api/submissions/circular/:circularId — fetch by circular
router.get("/circular/:circularId", authenticate, getSubmissionsByCircular);

// PUT /api/submissions/:id/override
router.put("/:id/override", authenticate, requireCO, overrideSubmissionVerdict);

export default router;
