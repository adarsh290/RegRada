import { Request, Response } from "express";
import Circular, { IMAP } from "../models/Circular";
import FormData from "form-data";
import axios from "axios";

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
    const mappedMaps = (extraction.maps || []).map((map, index) => ({
      ...map,
      map_id: `MAP-${(index + 1).toString().padStart(3, "0")}`,
      status: "pending" as const,
      assigned_to: map.department,
    }));

    const circular = new Circular({
      title,
      source,
      raw_text,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "fallback",
      status: "parsed",
      date_published: new Date(),
      maps: mappedMaps,
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
 * POST /api/circulars/upload-pdf
 *
 * Accepts a PDF file upload of a regulatory circular.
 * Forwards it to the AI service /parse-pdf endpoint.
 * Saves the circular + extracted MAPs to MongoDB.
 */
export async function ingestCircularPDF(req: Request, res: Response) {
  try {
    const { title, source } = req.body;
    const file = req.file;

    if (!title || !source) {
      res.status(400).json({ error: "Missing required fields: title, source" });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "No PDF file uploaded" });
      return;
    }

    // ── Forward PDF to AI Service ──────────────────────────────
    console.log(`📄 Forwarding PDF to AI service: ${AI_SERVICE_URL}/parse-pdf`);

    const fs = await import("fs");
    const form = new FormData();
    form.append("pdf_file", fs.createReadStream(file.path), file.originalname);

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/parse-pdf`, form, {
      headers: { ...form.getHeaders() },
    });

    const extraction = aiResponse.data as AIExtractionResponse;
    console.log(
      `✅ AI PDF extraction complete — ${extraction.maps?.length ?? 0} MAPs (mode: ${extraction.extraction_mode})`
    );

    // ── Save to MongoDB ─────────────────────────────────────────────
    const mappedMaps = (extraction.maps || []).map((map, index) => ({
      ...map,
      map_id: `MAP-${(index + 1).toString().padStart(3, "0")}`,
      status: "pending" as const,
      assigned_to: map.department,
    }));

    const circular = new Circular({
      title,
      source,
      raw_text: `[Extracted from PDF: ${file.originalname}]`,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "fallback",
      status: "parsed",
      date_published: new Date(),
      maps: mappedMaps,
    });

    await circular.save();
    console.log(`💾 PDF Circular saved: ${circular._id}`);

    // Clean up the temp uploaded file
    fs.unlinkSync(file.path);

    res.status(201).json({
      message: "PDF circular ingested and parsed successfully",
      circular,
    });
  } catch (err: any) {
    console.error("❌ ingestCircularPDF error:", err.message);
    res.status(500).json({
      error: err.response?.data?.detail || "Internal server error during PDF ingestion",
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

/**
 * GET /api/circulars/:id
 * 
 * Fetches a single circular by ID, including its MAPs.
 */
export async function getCircularById(req: Request, res: Response) {
  try {
    const circular = await Circular.findById(req.params.id);
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }
    res.json(circular);
  } catch (err) {
    console.error("❌ getCircularById error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/circulars/overdue
 *
 * Returns all MAPs that are past their deadline and not yet verified.
 * Sorted by most overdue first.
 */
export async function getOverdueMAPs(req: Request, res: Response) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const circulars = await Circular.find();

    const overdue: Array<{
      circular_id: string;
      circular_title: string;
      circular_source: string;
      map_id: string;
      action_title: string;
      department: string;
      deadline: string;
      priority: string;
      status: string;
      days_overdue: number;
    }> = [];

    for (const circular of circulars) {
      for (const map of circular.maps) {
        if (map.status === "verified") continue;
        if (!map.deadline || map.deadline === "Not specified") continue;

        const deadlineDate = new Date(map.deadline);
        if (isNaN(deadlineDate.getTime())) continue;

        deadlineDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - deadlineDate.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (daysOverdue > 0) {
          overdue.push({
            circular_id: (circular._id as any).toString(),
            circular_title: circular.title,
            circular_source: circular.source,
            map_id: map.map_id,
            action_title: map.action_title,
            department: map.department,
            deadline: map.deadline,
            priority: map.priority,
            status: map.status,
            days_overdue: daysOverdue,
          });
        }
      }
    }

    // Sort by most overdue first
    overdue.sort((a, b) => b.days_overdue - a.days_overdue);

    res.json(overdue);
  } catch (err) {
    console.error("❌ getOverdueMAPs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
