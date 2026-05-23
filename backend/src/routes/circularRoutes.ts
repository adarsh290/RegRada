import { Router } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import {
  ingestCircular,
  ingestCircularPDF,
  getCirculars,
  getCircularById,
  getOverdueMAPs,
  getObligationGraph,
  rejectMAP,
  assignMAP,
  getConflicts,
  resolveConflict,
  queryMaps,
  approveMAP,
} from "../controllers/circularController";
import { authenticate, requireCO } from "../middleware/authMiddleware";

const router = Router();

// ── Multer for PDF circular uploads ────────────────────────
const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },
  filename: (_req, file, cb) => {
    // BUG-BE2-026: Use crypto.randomUUID() instead of Math.random()
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `circular-${uniqueSuffix}.pdf`);
  },
});

const uploadPDF = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".pdf" && file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed for circular ingestion"));
    }
  },
});

// GET /api/circulars/overdue — overdue MAPs (MUST be before /:id)
router.get("/overdue", authenticate, getOverdueMAPs);

// GET /api/circulars/conflicts — unresolved conflicts (MUST be before /:id)
router.get("/conflicts", authenticate, getConflicts);

// POST /api/circulars/query — NL query for maps (MUST be before /:id)
router.post("/query", authenticate, queryMaps);

// POST /api/circulars — ingest raw text
router.post("/", authenticate, requireCO, ingestCircular);

// POST /api/circulars/upload-pdf — ingest from PDF
router.post(
  "/upload-pdf",
  authenticate,
  requireCO,
  (req, res, next) => {
    uploadPDF.single("pdf_file")(req, res, (err) => {
      // BUG-BE2-024: Catch Multer errors and return 400 instead of 500 html/crashing
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  ingestCircularPDF
);

// GET /api/circulars — fetch all circulars
router.get("/", authenticate, getCirculars);

// GET /api/circulars/:id/obligation-graph — obligation DAG (MUST be before /:id)
router.get("/:id/obligation-graph", authenticate, getObligationGraph);

// GET /api/circulars/:id — fetch single circular
router.get("/:id", authenticate, getCircularById);

// POST /api/circulars/:circularId/maps/:mapId/reject
router.post("/:circularId/maps/:mapId/reject", authenticate, rejectMAP);

// PUT /api/circulars/:circularId/maps/:mapId/assign
router.put("/:circularId/maps/:mapId/assign", authenticate, requireCO, assignMAP);

// PUT /api/circulars/:circularId/maps/:mapId/approve
router.put("/:circularId/maps/:mapId/approve", authenticate, requireCO, approveMAP);

// PUT /api/circulars/:id/conflicts/:conflictIndex/resolve
router.put("/:id/conflicts/:conflictIndex/resolve", authenticate, requireCO, resolveConflict);

export default router;
