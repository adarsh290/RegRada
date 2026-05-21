import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  ingestCircular,
  ingestCircularPDF,
  getCirculars,
  getCircularById,
  getOverdueMAPs,
  getObligationGraph,
  rejectMAP,
  assignMAP,
} from "../controllers/circularController";

const router = Router();

// ── Multer for PDF circular uploads ────────────────────────
const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `circular-${uniqueSuffix}.pdf`);
  },
});

const uploadPDF = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === ".pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed for circular ingestion"));
    }
  },
});

// GET /api/circulars/overdue — overdue MAPs (MUST be before /:id)
router.get("/overdue", getOverdueMAPs);

// POST /api/circulars — ingest raw text
router.post("/", ingestCircular);

// POST /api/circulars/upload-pdf — ingest from PDF
router.post("/upload-pdf", uploadPDF.single("pdf_file"), ingestCircularPDF);

// GET /api/circulars — fetch all circulars
router.get("/", getCirculars);

// GET /api/circulars/:id/obligation-graph — obligation DAG (MUST be before /:id)
router.get("/:id/obligation-graph", getObligationGraph);

// GET /api/circulars/:id — fetch single circular
router.get("/:id", getCircularById);

// POST /api/circulars/:circularId/maps/:mapId/reject
router.post("/:circularId/maps/:mapId/reject", rejectMAP);

// PUT /api/circulars/:circularId/maps/:mapId/assign
router.put("/:circularId/maps/:mapId/assign", assignMAP);

export default router;
