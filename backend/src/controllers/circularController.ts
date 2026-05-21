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

interface AIDepEdge {
  from_map_index: number;
  to_map_index: number;
  constraint: string;
}

/**
 * Calls the AI service to detect sequencing dependencies between MAPs.
 * Returns an array of edges using real map_ids (not indices).
 */
async function callDependencyDetection(
  maps: IMAP[]
): Promise<Array<{ from_map_id: string; to_map_id: string; constraint: string }>> {
  try {
    const payload = maps.slice(0, 10).map((m, i) => ({
      index: i,
      title: m.action_title,
      department: m.department,
    }));

    const res = await axios.post(`${AI_SERVICE_URL}/detect-dependencies`, { maps: payload });
    const edges: AIDepEdge[] = res.data.edges || [];

    return edges
      .filter((e) => e.from_map_index < maps.length && e.to_map_index < maps.length)
      .map((e) => ({
        from_map_id: maps[e.from_map_index].map_id,
        to_map_id: maps[e.to_map_index].map_id,
        constraint: e.constraint,
      }));
  } catch (err) {
    console.warn("⚠️  Dependency detection failed — saving circular without edges.", err);
    return [];
  }
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

    // Async dependency detection — don't block response
    const depEdges = await callDependencyDetection(mappedMaps as unknown as IMAP[]);
    if (depEdges.length > 0) {
      circular.dependency_edges = depEdges;
      await circular.save();
      console.log(`🔗 Saved ${depEdges.length} dependency edges`);
    }

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

    // Async dependency detection
    const depEdges = await callDependencyDetection(mappedMaps as unknown as IMAP[]);
    if (depEdges.length > 0) {
      circular.dependency_edges = depEdges;
      await circular.save();
      console.log(`🔗 Saved ${depEdges.length} dependency edges for PDF circular`);
    }

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

/**
 * GET /api/circulars/:id/obligation-graph
 *
 * Returns the obligation DAG for a circular:
 * nodes = MAPs, edges = dependency edges with constraint labels.
 * Each node includes a `blocked` flag (true if any predecessor is not verified).
 */
export async function getObligationGraph(req: Request, res: Response) {
  try {
    const circular = await Circular.findById(req.params.id);
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }

    // Build a set of verified map_ids for blocking logic
    const verifiedIds = new Set(
      circular.maps.filter((m) => m.status === "verified").map((m) => m.map_id)
    );

    // Build a set of map_ids that have unverified predecessors (blocked)
    const blockedIds = new Set<string>();
    for (const edge of circular.dependency_edges) {
      if (!verifiedIds.has(edge.from_map_id)) {
        blockedIds.add(edge.to_map_id);
      }
    }

    const nodes = circular.maps.map((m) => ({
      id: m.map_id,
      action_title: m.action_title,
      department: m.department,
      deadline: m.deadline,
      priority: m.priority,
      status: m.status,
      blocked: blockedIds.has(m.map_id),
    }));

    const edges = circular.dependency_edges.map((e, idx) => ({
      id: `dep-${idx}`,
      from_map_id: e.from_map_id,
      to_map_id: e.to_map_id,
      constraint: e.constraint,
    }));

    res.json({
      circular_id: (circular._id as any).toString(),
      title: circular.title,
      source: circular.source,
      nodes,
      edges,
    });
  } catch (err) {
    console.error("❌ getObligationGraph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/circulars/:circularId/maps/:mapId/reject
 */
export async function rejectMAP(req: Request, res: Response) {
  try {
    const { circularId, mapId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      res.status(400).json({ error: "Missing required field: reason" });
      return;
    }

    const circular = await Circular.findById(circularId);
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }

    const map = circular.maps.find((m) => m.map_id === mapId);
    if (!map) {
      res.status(404).json({ error: "MAP not found" });
      return;
    }

    map.rejection_count = (map.rejection_count || 0) + 1;
    
    map.audit_trail.push({
      action: "Rejected",
      by: map.assigned_to || map.department,
      comment: reason,
      timestamp: new Date()
    });

    if (map.rejection_count >= 2) {
      map.status = "escalated";
      await circular.save();
      res.json({ message: "Task escalated to Compliance Officer", map });
      return;
    }

    // Call AI to re-evaluate
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/reevaluate`, {
        action_title: map.action_title,
        current_department: map.assigned_to || map.department,
        rejection_reason: reason
      });
      
      const { assigned_department, reasoning } = aiResponse.data;
      
      map.assigned_to = assigned_department;
      map.department = assigned_department;
      
      map.audit_trail.push({
        action: "AI Re-evaluation",
        by: "AI System",
        comment: `Reassigned to ${assigned_department}. Reasoning: ${reasoning}`,
        timestamp: new Date()
      });
      
      await circular.save();
      res.json({ message: "Task re-evaluated by AI", map });
    } catch (aiErr: any) {
      console.error("❌ AI Re-evaluation failed:", aiErr.message);
      res.status(502).json({ error: "AI Re-evaluation failed" });
    }
  } catch (err) {
    console.error("❌ rejectMAP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/circulars/:circularId/maps/:mapId/assign
 */
export async function assignMAP(req: Request, res: Response) {
  try {
    const { circularId, mapId } = req.params;
    const { assigned_to } = req.body;
    
    if (!assigned_to) {
      res.status(400).json({ error: "Missing required field: assigned_to" });
      return;
    }

    const circular = await Circular.findById(circularId);
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }

    const map = circular.maps.find((m) => m.map_id === mapId);
    if (!map) {
      res.status(404).json({ error: "MAP not found" });
      return;
    }

    map.assigned_to = assigned_to;
    map.department = assigned_to;
    map.status = "pending";
    
    map.audit_trail.push({
      action: "Manual Override",
      by: "Compliance Officer",
      comment: `Force assigned to ${assigned_to}`,
      timestamp: new Date()
    });

    await circular.save();
    res.json({ message: "Task successfully assigned", map });
  } catch (err) {
    console.error("❌ assignMAP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
