import { Request, Response } from "express";
import Circular, { IMAP } from "../models/Circular";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

/** Shape of the JSON returned by the Python AI service */
interface AIExtractionResponse {
  summary: string;
  maps: IMAP[];
  extraction_mode: string;
}

/**
 * POST /api/circulars
 *
 * Ingests a regulatory circular:
 * 1. Sends raw_text to the Python AI service for MAP extraction.
 * 2. Saves the circular + extracted MAPs to MongoDB.
 */
export async function ingestCircular(req: Request, res: Response) {
  try {
    const { title, source, raw_text } = req.body;

    // ── Validate ─────────────────────────────────────────
    if (!title || !source || !raw_text) {
      res.status(400).json({
        error: "Missing required fields: title, source, raw_text",
      });
      return;
    }

    // ── Call AI Service ──────────────────────────────────
    console.log(`📡 Sending circular to AI service: ${AI_SERVICE_URL}/parse`);

    const aiResponse = await fetch(`${AI_SERVICE_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: raw_text }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      console.error(`❌ AI service error (${aiResponse.status}): ${errorBody}`);
      res.status(502).json({
        error: "AI service returned an error",
        detail: errorBody,
      });
      return;
    }

    const extraction = (await aiResponse.json()) as AIExtractionResponse;
    console.log(
      `✅ AI extraction complete — ${extraction.maps?.length ?? 0} MAPs extracted (mode: ${extraction.extraction_mode})`
    );

    // ── Save to MongoDB ──────────────────────────────────
    const circular = new Circular({
      title,
      source,
      raw_text,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "fallback",
      status: "parsed",
      date_published: new Date(),
      maps: extraction.maps || [],
    });

    await circular.save();
    console.log(`💾 Circular saved: ${circular._id}`);

    res.status(201).json({
      message: "Circular ingested and parsed successfully",
      circular,
    });
  } catch (err) {
    console.error("❌ ingestCircular error:", err);
    res.status(500).json({
      error: "Internal server error during circular ingestion",
    });
  }
}

/**
 * GET /api/circulars
 * 
 * Fetches ingested circulars, sorted by date descending.
 */
export async function getCirculars(req: Request, res: Response) {
  try {
    const circulars = await Circular.find().sort({ created_at: -1 });
    res.json(circulars);
  } catch (err) {
    console.error("❌ getCirculars error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
