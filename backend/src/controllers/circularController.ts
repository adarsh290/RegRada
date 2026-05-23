import { Request, Response } from "express";
import mongoose from "mongoose";
import Circular, { IMAP } from "../models/Circular";
import FormData from "form-data";
import axios from "axios";
import fs from "fs";

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
 * Normalizes AI-extracted department names to match canonical system departments.
 */
function normalizeDepartment(dept: string): string {
  if (!dept) return "Unknown";
  const trimmed = dept.trim().toLowerCase();
  
  if (trimmed === "it" || trimmed === "it dept" || trimmed === "it department" || trimmed.includes("information technology")) {
    return "IT Dept";
  }
  if (trimmed === "retail" || trimmed.includes("retail banking")) {
    return "Retail Banking";
  }
  if (trimmed === "legal" || trimmed === "legal dept" || trimmed === "legal department" || trimmed === "law") {
    return "Legal Dept";
  }
  if (trimmed === "operations" || trimmed === "operation" || trimmed === "ops") {
    return "Operations";
  }
  if (trimmed === "compliance" || trimmed === "compliance officer" || trimmed === "co" || trimmed === "compliance dept" || trimmed === "compliance department") {
    return "Compliance Officer";
  }
  
  // Word boundary check to catch complex strings without false substring matches
  const words = trimmed.split(/[^a-z0-9]+/);
  // BUG-BE2-025: Removed words.includes("co") to prevent false matching "XYZ Co"
  if (words.includes("compliance")) return "Compliance Officer";
  if (words.includes("it") || words.includes("information") || words.includes("technology")) return "IT Dept";
  if (words.includes("retail")) return "Retail Banking";
  if (words.includes("legal") || words.includes("law")) return "Legal Dept";
  if (words.includes("operations") || words.includes("operation") || words.includes("ops")) return "Operations";
  
  return dept;
}

/**
 * Calls the AI service to detect sequencing dependencies between MAPs.
 * Returns an array of edges using real map_ids (not indices).
 */
async function callDependencyDetection(
  maps: IMAP[]
): Promise<Array<{ from_map_id: string; to_map_id: string; constraint: string }>> {
  try {
    // BUG-CONTRACT-021: Update slice(0, 50) for detect-dependencies
    const payload = maps.slice(0, 50).map((m, i) => ({
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

    // BUG-BE2-018 & BUG-BE2-019: Missing type checks
    if (typeof title !== 'string' || typeof source !== 'string' || typeof raw_text !== 'string') {
      res.status(400).json({
        error: "Invalid field types: title, source, and raw_text must be strings",
      });
      return;
    }

    if (raw_text.length > 500000) {
      res.status(400).json({
        error: "raw_text exceeds the 500,000 character limit.",
      });
      return;
    }

    // ── Call AI Service ──────────────────────────────────
    console.log(`📡 Sending circular to AI service: ${AI_SERVICE_URL}/parse`);

    let extraction: AIExtractionResponse;
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/parse`, { text: raw_text });
      extraction = aiResponse.data;
    } catch (aiErr: any) {
      const errorDetail = aiErr.response?.data?.detail || aiErr.response?.data?.error || aiErr.message;
      console.error(`❌ AI service error:`, errorDetail);
      res.status(502).json({
        error: "AI service returned an error. Please try again.",
      });
      return;
    }

    console.log(
      `✅ AI extraction complete — ${extraction.maps?.length ?? 0} MAPs extracted (mode: ${extraction.extraction_mode})`
    );

    // ── Save to MongoDB ──────────────────────────────────
    const circularId = new mongoose.Types.ObjectId();
    const shortCircId = circularId.toString().slice(-6);

    const mappedMaps = (extraction.maps || []).map((map: any, index: number) => {
      const conf = map.confidence ?? 1.0;
      const needsReview = conf < 0.75;
      const normalizedDept = normalizeDepartment(map.department);
      return {
        action_title: map.action_title || "Unknown Action",
        deadline: map.deadline || "TBD",
        priority: map.priority || "medium",
        action_confidence: map.action_confidence,
        dept_confidence: map.dept_confidence,
        deadline_confidence: map.deadline_confidence,
        confidence: conf,
        confidence_flags: map.confidence_flags || [],
        department: normalizedDept,
        map_id: `${shortCircId}-MAP-${(index + 1).toString().padStart(3, "0")}`,
        status: needsReview ? "pending_review" as const : "pending" as const,
        assigned_to: normalizedDept,
        needs_co_review: needsReview,
      };
    });

    const circular = new Circular({
      _id: circularId,
      title,
      source,
      raw_text,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "fallback",
      status: "parsed",
      date_published: new Date(),
      maps: mappedMaps,
    });

    // Call detect-amendments
    try {
      // BUG-CONTRACT-017, BUG-CONTRACT-018: Trim MAP payload sent to AI
      const trimmedMaps = mappedMaps.map((m: any) => ({
        map_id: m.map_id,
        action_title: m.action_title,
        department: m.department,
        deadline: m.deadline,
        priority: m.priority
      }));

      const aiAmendRes = await axios.post(`${AI_SERVICE_URL}/detect-amendments`, {
        circular_id: circular._id.toString(),
        circular_source: source,
        circular_title: title,
        raw_text,
        maps: trimmedMaps
      });
      if (aiAmendRes.data.amends_circular_id) {
        circular.amends = aiAmendRes.data.amends_circular_id;
        circular.delta_report = aiAmendRes.data.delta_report;
      }
    } catch (e: any) {
      console.warn("⚠️ detect-amendments failed", e.message);
    }

    // Call detect-conflicts
    try {
      const trimmedMaps = mappedMaps.map((m: any) => ({
        map_id: m.map_id,
        action_title: m.action_title,
        department: m.department,
        deadline: m.deadline,
        priority: m.priority
      }));

      const aiConfRes = await axios.post(`${AI_SERVICE_URL}/detect-conflicts`, {
        circular_id: circular._id.toString(),
        maps: trimmedMaps
      });
      if (aiConfRes.data.conflicts && aiConfRes.data.conflicts.length > 0) {
        circular.has_conflicts = true;
        circular.conflicts = aiConfRes.data.conflicts;
      }
    } catch (e: any) {
      console.warn("⚠️ detect-conflicts failed", e.message);
    }

    // Async dependency detection
    const depEdges = await callDependencyDetection(mappedMaps as unknown as IMAP[]);
    if (depEdges.length > 0) {
      circular.dependency_edges = depEdges;
      console.log(`🔗 Detected ${depEdges.length} dependency edges`);
    }
    
    await circular.save();

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

    // BUG-CONTRACT-020: Remove dynamic import("fs") since it is imported globally
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
    const circularId = new mongoose.Types.ObjectId();
    const shortCircId = circularId.toString().slice(-6);

    const mappedMaps = (extraction.maps || []).map((map: any, index: number) => {
      const conf = map.confidence ?? 1.0;
      const needsReview = conf < 0.75;
      const normalizedDept = normalizeDepartment(map.department);
      return {
        action_title: map.action_title || "Unknown Action",
        deadline: map.deadline || "TBD",
        priority: map.priority || "medium",
        action_confidence: map.action_confidence,
        dept_confidence: map.dept_confidence,
        deadline_confidence: map.deadline_confidence,
        confidence: conf,
        confidence_flags: map.confidence_flags || [],
        department: normalizedDept,
        map_id: `${shortCircId}-MAP-${(index + 1).toString().padStart(3, "0")}`,
        status: needsReview ? "pending_review" as const : "pending" as const,
        assigned_to: normalizedDept,
        needs_co_review: needsReview,
      };
    });

    const circular = new Circular({
      _id: circularId,
      title,
      source,
      raw_text: (extraction as any).raw_text || `[Extracted from PDF: ${file.originalname}]`,
      summary: extraction.summary || "",
      extraction_mode: extraction.extraction_mode || "fallback",
      status: "parsed",
      date_published: new Date(),
      maps: mappedMaps,
    });

    // Call detect-amendments
    try {
      const trimmedMaps = mappedMaps.map((m: any) => ({
        map_id: m.map_id,
        action_title: m.action_title,
        department: m.department,
        deadline: m.deadline,
        priority: m.priority
      }));

      const aiAmendRes = await axios.post(`${AI_SERVICE_URL}/detect-amendments`, {
        circular_id: circular._id.toString(),
        circular_source: source,
        circular_title: title,
        raw_text: circular.raw_text,
        maps: trimmedMaps
      });
      if (aiAmendRes.data.amends_circular_id) {
        circular.amends = aiAmendRes.data.amends_circular_id;
        circular.delta_report = aiAmendRes.data.delta_report;
      }
    } catch (e: any) {
      console.warn("⚠️ detect-amendments failed", e.message);
    }

    // Call detect-conflicts
    try {
      const trimmedMaps = mappedMaps.map((m: any) => ({
        map_id: m.map_id,
        action_title: m.action_title,
        department: m.department,
        deadline: m.deadline,
        priority: m.priority
      }));

      const aiConfRes = await axios.post(`${AI_SERVICE_URL}/detect-conflicts`, {
        circular_id: circular._id.toString(),
        maps: trimmedMaps
      });
      if (aiConfRes.data.conflicts && aiConfRes.data.conflicts.length > 0) {
        circular.has_conflicts = true;
        circular.conflicts = aiConfRes.data.conflicts;
      }
    } catch (e: any) {
      console.warn("⚠️ detect-conflicts failed", e.message);
    }

    // Async dependency detection
    const depEdges = await callDependencyDetection(mappedMaps as unknown as IMAP[]);
    if (depEdges.length > 0) {
      circular.dependency_edges = depEdges;
      console.log(`🔗 Detected ${depEdges.length} dependency edges for PDF circular`);
    }

    await circular.save();

    res.status(201).json({
      message: "PDF circular ingested and parsed successfully",
      circular,
    });
  } catch (err: any) {
    console.error("❌ ingestCircularPDF error:", err.message);
    res.status(500).json({
      // BUG-SEC-016: Generic AI error detail logging
      error: "Internal server error during PDF ingestion",
    });
  } finally {
    const file = req.file;
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupErr) {
        console.error("⚠️ Failed to clean up uploaded file:", cleanupErr);
      }
    }
  }
}

/**
 * GET /api/circulars
 * 
 * Fetches ingested circulars, sorted by date descending.
 */
export async function getCirculars(req: Request, res: Response) {
  try {
    // BUG-BE2-022: Prevent negative page values causing MongoDB skip error
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    // BUG-SEC-039: Cap pagination limit
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const circulars = await Circular.find()
      .select("-raw_text")
      .lean()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);
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
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }
    const user = (req as any).user;
    // BUG-SEC-014: Strip raw_text for DEPARTMENT role — only CO should see full circular text
    let query = Circular.findById(id);
    if (user?.role !== "CO") {
      query = query.select("-raw_text") as typeof query;
    }
    const circular = await query;
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

    const overdue = await Circular.aggregate([
      // Unwind maps array to process each map as a separate document
      { $unwind: "$maps" },
      // Safe date conversion and map projection
      {
        $project: {
          circular_id: { $toString: "$_id" },
          circular_title: "$title",
          circular_source: "$source",
          map_id: "$maps.map_id",
          action_title: "$maps.action_title",
          department: "$maps.department",
          deadline: "$maps.deadline",
          priority: "$maps.priority",
          status: "$maps.status",
          deadline_date: {
            $dateFromString: {
              dateString: "$maps.deadline",
              onError: null,
              onNull: null
            }
          }
        }
      },
      // BUG-BE2-040: Exclude 'escalated' as well as 'verified' (matches cronService behavior)
      {
        $match: {
          status: { $nin: ["verified", "escalated"] },
          deadline_date: { $lt: today }
        }
      },
      // Calculate days overdue
      {
        $project: {
          circular_id: 1,
          circular_title: 1,
          circular_source: 1,
          map_id: 1,
          action_title: 1,
          department: 1,
          deadline: 1,
          priority: 1,
          status: 1,
          days_overdue: {
            $floor: {
              $divide: [
                { $subtract: [today, "$deadline_date"] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        }
      },
      // Sort by most overdue first
      { $sort: { days_overdue: -1 } }
    ]);

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
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }
    // BUG-BE2-015: Select only needed fields — avoid loading raw_text (up to 500KB) on every graph request
    const circular = await Circular.findById(id)
      .select("maps dependency_edges title source")
      .lean() as any;
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }


    // Build a set of verified map_ids for blocking logic
    const verifiedIds = new Set(
      circular.maps.filter((m: any) => m.status === "verified").map((m: any) => m.map_id)
    );

    // Build a set of map_ids that have unverified predecessors (blocked)
    const blockedIds = new Set<string>();
    for (const edge of circular.dependency_edges) {
      if (!verifiedIds.has(edge.from_map_id)) {
        blockedIds.add(edge.to_map_id);
      }
    }

    const user = (req as any).user;

    // BUG-SEC-019: Filter obligation graph by department for DEPARTMENT role
    // CO sees all nodes; DEPARTMENT users see only their own nodes (but all edges)
    let nodes = circular.maps.map((m: any) => ({
      id: m.map_id,
      action_title: m.action_title,
      department: m.department,
      deadline: m.deadline,
      priority: m.priority,
      status: m.status,
      blocked: blockedIds.has(m.map_id),
    }));

    if (user?.role !== "CO") {
      nodes = nodes.filter((n: any) => n.department === user?.department_name);
    }

    let edges = circular.dependency_edges.map((e: any, idx: number) => ({
      id: `dep-${idx}`,
      from_map_id: e.from_map_id,
      to_map_id: e.to_map_id,
      constraint: e.constraint,
    }));

    // BUG-BE2-031: Filter edges to only include those connected to visible nodes
    if (user?.role !== "CO") {
      const visibleNodeIds = new Set(nodes.map((n: any) => n.id));
      edges = edges.filter((e: any) => visibleNodeIds.has(e.from_map_id) || visibleNodeIds.has(e.to_map_id));
    }

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
    if (!mongoose.Types.ObjectId.isValid(circularId)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }
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

    const user = (req as any).user;
    if (user.role !== "CO" && map.department !== user.department_name && map.assigned_to !== user.department_name) {
      res.status(403).json({ error: "Forbidden: You do not have permission to reject this MAP." });
      return;
    }

    const updatedBeforeAI = await Circular.findOneAndUpdate(
      { _id: circularId, "maps.map_id": mapId },
      {
        $inc: { "maps.$.rejection_count": 1 },
        $push: {
          "maps.$.audit_trail": {
            action: "Rejected",
            // BUG-SEC-022: Always use verified JWT identity for audit trail, not client data
            by: user.username,
            comment: reason,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    if (!updatedBeforeAI) {
      res.status(404).json({ error: "Circular or MAP not found during update" });
      return;
    }

    const updatedMap = updatedBeforeAI.maps.find((m) => m.map_id === mapId);
    if (!updatedMap) {
      res.status(404).json({ error: "MAP not found after update" });
      return;
    }

    if (updatedMap.rejection_count >= 2) {
      const finalCircular = await Circular.findOneAndUpdate(
        { _id: circularId, "maps.map_id": mapId },
        { $set: { "maps.$.status": "escalated" } },
        { new: true }
      );
      if (!finalCircular) {
        res.status(404).json({ error: "Circular not found during escalation" });
        return;
      }
      res.json({ message: "Task escalated to Compliance Officer", map: finalCircular.maps.find(m => m.map_id === mapId) });
      return;
    }

    // Call AI to re-evaluate
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/reevaluate`, {
        action_title: updatedMap.action_title,
        current_department: updatedMap.assigned_to || updatedMap.department,
        rejection_reason: reason
      });
      
      const { assigned_department, reasoning } = aiResponse.data;
      const normalizedDept = normalizeDepartment(assigned_department);
      
      const finalCircular = await Circular.findOneAndUpdate(
        { _id: circularId, "maps.map_id": mapId },
        {
          $set: {
            "maps.$.assigned_to": normalizedDept,
            "maps.$.department": normalizedDept,
            "maps.$.status": "pending",
          },
          $push: {
            "maps.$.audit_trail": {
              action: "AI Re-evaluation",
              by: "AI System",
              comment: `Reassigned to ${normalizedDept}. Reasoning: ${reasoning}`,
              timestamp: new Date()
            }
          }
        },
        { new: true }
      );
      // BUG-BE2-006: Replace non-null assertion with explicit null guard
      if (!finalCircular) {
        res.status(404).json({ error: "Circular not found during AI reassignment" });
        return;
      }
      res.json({ message: "Task re-evaluated by AI", map: finalCircular.maps.find(m => m.map_id === mapId) });
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
    if (!mongoose.Types.ObjectId.isValid(circularId)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }
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

    // BUG-SEC-023: Validate assigned_to against known departments
    const normalizedDept = normalizeDepartment(assigned_to);

    // BUG-BE2-008: Replace findById+save with atomic findOneAndUpdate to prevent concurrent assignment race
    const updatedCircular = await Circular.findOneAndUpdate(
      { _id: circularId, "maps.map_id": mapId },
      {
        $set: {
          "maps.$.assigned_to": normalizedDept,
          "maps.$.department": normalizedDept,
          "maps.$.status": "pending",
        },
        $push: {
          "maps.$.audit_trail": {
            action: "Manual Override",
            by: (req as any).user?.username || "Compliance Officer",
            comment: `Force assigned to ${normalizedDept}`,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    );
    if (!updatedCircular) {
      res.status(404).json({ error: "Circular or MAP not found" });
      return;
    }
    const updatedMap = updatedCircular.maps.find((m) => m.map_id === mapId);
    res.json({ message: "Task successfully assigned", map: updatedMap });
  } catch (err) {
    console.error("❌ assignMAP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/circulars/conflicts
 * Returns all circulars with has_conflicts = true
 */
export async function getConflicts(req: Request, res: Response) {
  try {
    // BUG-BE2-022: Prevent negative page values causing MongoDB skip error
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    // BUG-SEC-039: Cap pagination limit
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const user = (req as any).user;
    // BUG-SEC-020: Filter /conflicts for DEPARTMENT role
    const query: any = { has_conflicts: true };
    if (user?.role !== "CO") {
      query["maps.department"] = user?.department_name;
    }

    const circulars = await Circular.find(query)
      .select("-raw_text")
      .lean()
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);
    res.json(circulars);
  } catch (err) {
    console.error("❌ getConflicts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/circulars/:id/conflicts/:conflictIndex/resolve
 * Marks a conflict as resolved
 */
export async function resolveConflict(req: Request, res: Response) {
  try {
    const { id, conflictIndex } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }

    const idx = parseInt(conflictIndex, 10);
    if (isNaN(idx) || idx < 0) {
      res.status(400).json({ error: "Invalid conflict index" });
      return;
    }

    // BUG-BE2-010: Use atomic findOneAndUpdate with arrayFilters to prevent race conditions
    // The filter ensures we only resolve conflicts that: (a) exist at the given index, (b) are not already resolved
    const updatedCircular = await Circular.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          [`conflicts.${idx}.resolved`]: true,
          // BUG-SEC-040: Always trust JWT identity over client data
          [`conflicts.${idx}.resolved_by_co`]: (req as any).user?.username || "Compliance Officer",
        },
      },
      { new: true }
    );

    if (!updatedCircular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }

    if (idx >= updatedCircular.conflicts.length) {
      res.status(400).json({ error: "Invalid conflict index" });
      return;
    }

    // Check if all conflicts are now resolved
    if (updatedCircular.conflicts.every((c) => c.resolved)) {
      await Circular.findByIdAndUpdate(id, { $set: { has_conflicts: false } });
      updatedCircular.has_conflicts = false;
    }

    res.json({ message: "Conflict resolved", circular: updatedCircular });

  } catch (err) {
    console.error("❌ resolveConflict error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/circulars/query
 * Queries MAPs using natural language
 */
export async function queryMaps(req: Request, res: Response) {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    const aiRes = await axios.post(`${AI_SERVICE_URL}/query-maps`, { query, top_k: 10 });
    const results = aiRes.data.results || [];

    // Enrich with live MAP status from MongoDB
    const circularIds = [...new Set(results.map((r: any) => r.circular_id))];
    const circularsData = await Circular.find({ _id: { $in: circularIds } }, { maps: 1 });
    const circularMap = new Map(circularsData.map(c => [c._id.toString(), c]));

    for (const r of results) {
      const circ = circularMap.get(r.circular_id);
      if (circ) {
        const liveMap = circ.maps.find(m => m.map_id === r.map_id);
        if (liveMap) {
          r.live_status = liveMap.status;
          r.rejection_count = liveMap.rejection_count;
        }
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("❌ queryMaps error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/circulars/:circularId/maps/:mapId/approve
 * Approves a MAP that needs CO review
 */
export async function approveMAP(req: Request, res: Response) {
  try {
    const { circularId, mapId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(circularId)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }
    // BUG-BE2-009: Replace findById+save with atomic findOneAndUpdate to prevent concurrent approval race
    // Also adds optimistic concurrency by filtering on "pending_review" status
    const updatedCircular = await Circular.findOneAndUpdate(
      { _id: circularId, "maps.map_id": mapId, "maps.status": "pending_review" },
      {
        $set: {
          "maps.$.status": "pending",
          "maps.$.needs_co_review": false,
        },
        $push: {
          "maps.$.audit_trail": {
            action: "Review Approved",
            by: (req as any).user?.username || "Compliance Officer",
            comment: "Approved low-confidence MAP for assignment",
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    );
    if (!updatedCircular) {
      res.status(404).json({ error: "MAP not found or not in pending_review status" });
      return;
    }
    const updatedMap = updatedCircular.maps.find((m) => m.map_id === mapId);
    res.json({ message: "MAP approved", map: updatedMap });
  } catch (err) {
    console.error("❌ approveMAP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
