import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import mongoose from "mongoose";
import Circular from "../models/Circular";
import Submission from "../models/Submission";
import { AuthPayload } from "../middleware/authMiddleware";

/**
 * POST /api/submissions
 *
 * Department uploads a proof-of-compliance file for a specific MAP.
 * Updates the MAP's status to "submitted" in the parent Circular.
 */
export async function submitProof(req: Request, res: Response) {
  const files = req.files as Express.Multer.File[];
  try {
    const { circular_id, map_id, notes } = req.body;

    if (!circular_id || !map_id) {
      res.status(400).json({ error: "Missing required fields: circular_id, map_id" });
      return;
    }
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    // ── Find the parent Circular and the target MAP ────────
    const circular = await Circular.findById(circular_id);
    if (!circular) {
      res.status(404).json({ error: "Circular not found" });
      return;
    }

    const map = circular.maps.find((m) => m.map_id === map_id);
    if (!map) {
      res.status(404).json({ error: `MAP ${map_id} not found in this circular` });
      return;
    }

    // ── IDOR & Department Isolation Constraints ────────────
    const user = (req as any).user as AuthPayload;
    if (user && user.role === "DEPARTMENT" && map.department !== user.department_name && map.assigned_to !== user.department_name) {
      res.status(403).json({
        error: `Access denied. This MAP belongs to the ${map.department} (assigned to ${map.assigned_to}) department, but you belong to ${user.department_name}.`,
      });
      return;
    }

    // BUG-BE2-005: Guard MAP status — prevent re-submission for finalized MAPs
    const validSubmitStatuses = ["pending", "in_progress", "rejected"];
    if (!validSubmitStatuses.includes(map.status)) {
      res.status(409).json({
        error: `Cannot submit proof for MAP in status '${map.status}'. Only pending, in_progress, or rejected MAPs accept new submissions.`,
      });
      return;
    }

    // ── Create Submission record ───────────────────────
    const submission = new Submission({
      circular_id: circular._id,
      circular_title: circular.title,
      map_id,
      map_action: map.action_title,
      department: map.department,
      proof_files: files.map(f => ({ file_path: f.path, original_filename: path.basename(f.originalname), file_size: f.size })),
      notes: notes || "",
      status: "submitted",
      submitted_at: new Date(),
    });

    await submission.save();

    // ── Run AI Validation (concatenate all doc text) ────────────
    console.log(`🤖 Starting AI Validation for ${submission._id} with ${files.length} file(s)...`);
    try {
      const form = new FormData();
      files.forEach(f => form.append("proof_files", fs.createReadStream(f.path), f.originalname));
      form.append("original_map_action", map.action_title);
      form.append("original_map_department", map.department);

      const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/validate`, form, {
        headers: {
          ...form.getHeaders(),
        },
      });
      // BUG-BE2-001: Extract verdict data from AI response
      const verdictData = aiResponse.data;

      // BUG-SEC-031: AI verdict is ADVISORY only — keep submission and MAP status as "submitted"
      // The MAP status only changes to "verified" or "rejected" after explicit CO override.
      // This prevents a compromised/prompt-injected AI from falsely marking compliance as fulfilled.
      submission.ai_verdict = {
        is_compliant: !!verdictData.is_compliant,
        confidence: Number(verdictData.confidence ?? 1.0),
        reasoning: String(verdictData.reasoning ?? ""),
        missing_items: Array.isArray(verdictData.missing_items) ? verdictData.missing_items.map(String) : [],
        verdict: verdictData.verdict === "verified" ? "verified" : "rejected",
        evaluated_at: new Date(),
      };
      submission.status = "pending_review"; // BUG-BE2-002: enum now includes pending_review
      await submission.save();

      // BUG-SEC-031: Do NOT auto-update the MAP status from AI verdict
      // The MAP remains "submitted" until the CO explicitly calls overrideSubmissionVerdict
      console.log(`🤖 AI verdict advisory: ${verdictData.verdict} (confidence: ${verdictData.confidence}). Awaiting CO review.`);
    } catch (aiErr: any) {
      console.error("❌ AI Validation failed:", aiErr.message);
      // We don't fail the submission upload if AI validation fails.
      // It stays in "submitted" status.
    }

    console.log(`✅ Proof submitted and evaluated: ${submission._id} for MAP ${map_id}`);

    // BUG-SEC-018: Return only safe fields — exclude absolute file_path (server path disclosure)
    res.status(201).json({
      message: "Proof of compliance submitted successfully. Pending CO review.",
      submission_id: submission._id,
      status: submission.status,
      ai_verdict: submission.ai_verdict
        ? { verdict: submission.ai_verdict.verdict, confidence: submission.ai_verdict.confidence }
        : null,
    });
  } catch (err) {
    console.error("❌ submitProof error:", err);
    try {
      if (files && files.length > 0) {
        files.forEach(f => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }
    } catch (unlinkErr) {
      console.warn("⚠️ Failed to cleanup uploaded files after error:", unlinkErr);
    }
    res.status(500).json({ error: "Internal server error during proof submission" });
  }
}

/**
 * GET /api/submissions
 *
 * Fetches submissions. Optionally filter by department via ?department=IT%20Dept
 */
export async function getSubmissions(req: Request, res: Response) {
  try {
    const user = (req as any).user as AuthPayload;
    const filter: any = {};

    if (user && user.role === "DEPARTMENT") {
      filter.department = user.department_name;
    } else {
      const { department } = req.query;
      if (department) {
        filter.department = String(department);
      }
    }

    // BUG-BE2-021: Prevent negative page values
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    // BUG-BE2-020: Cap limit to prevent DoS
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    // BUG-CONTRACT-012: Remove .lean() so Mongoose toJSON transforms (incl. original_filename virtual) are applied
    const submissions = await Submission.find(filter)
      .sort({ submitted_at: -1 })
      .skip(skip)
      .limit(limit);
    res.json(submissions);
  } catch (err) {
    console.error("❌ getSubmissions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/submissions/circular/:circularId
 *
 * Fetches all submissions for a given circular.
 */
export async function getSubmissionsByCircular(req: Request, res: Response) {
  try {
    const { circularId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(circularId)) {
      res.status(400).json({ error: "Invalid Circular ID format" });
      return;
    }

    const user = (req as any).user as AuthPayload;
    const filter: any = { circular_id: circularId };

    if (user && user.role === "DEPARTMENT") {
      filter.department = user.department_name;
    }

    // BUG-BE2-014: Add pagination — was unbounded
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      Submission.find(filter).sort({ submitted_at: -1 }).skip(skip).limit(limit),
      Submission.countDocuments(filter),
    ]);
    res.json({ submissions, total, page, limit });

  } catch (err) {
    console.error("❌ getSubmissionsByCircular error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/submissions/:id/override
 */
export async function overrideSubmissionVerdict(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid Submission ID format" });
      return;
    }
    const { verdict, comment } = req.body;

    if (!verdict || !["verified", "rejected"].includes(verdict)) {
      res.status(400).json({ error: "Invalid verdict. Must be 'verified' or 'rejected'" });
      return;
    }

    // BUG-BE2-003: Use findByIdAndUpdate instead of findById+save to prevent TOCTOU race
    const submission = await Submission.findByIdAndUpdate(
      id,
      {
        $set: {
          status: verdict,
          overridden_by_co: true,
          co_comment: comment || "",
          reviewed_at: new Date(),
        },
      },
      { new: true, runValidators: true }
    );
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    // BUG-BE2-004: Use findOneAndUpdate with positional operator for atomic Circular MAP update
    // This prevents Submission and Circular MAP from going out of sync if the Circular save fails
    await Circular.findOneAndUpdate(
      { _id: submission.circular_id, "maps.map_id": submission.map_id },
      {
        $set: { "maps.$.status": verdict },
        $push: {
          "maps.$.audit_trail": {
            action: "Verdict Overridden",
            by: (req as any).user?.username || "Compliance Officer",
            comment: `Overridden to ${verdict}. Reason: ${comment}`,
            timestamp: new Date(),
          },
        },
      }
    );

    res.json({ message: "Submission verdict overridden successfully", submission });

  } catch (err) {
    console.error("❌ overrideSubmissionVerdict error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
