import { Router } from "express";
import { ingestCircular, getCirculars } from "../controllers/circularController";

const router = Router();

// POST /api/circulars — ingest a new regulatory circular
router.post("/", ingestCircular);

// GET /api/circulars — fetch ingested circulars
router.get("/", getCirculars);

export default router;
