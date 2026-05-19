import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import Circular from "../models/Circular";
import Submission from "../models/Submission";

/**
 * POST /api/submissions
 *
 * Department uploads a proof-of-compliance file for a specific MAP.
 * Updates the MAP's status to "submitted" in the parent Circular.
 */
export async function submitProof(req: Request, res: Response) {
  try {
    const { circular_id, map_id, notes } = req.body;
    const file = req.file;

    if (!circular_id || !map_id) {
      res.status(400).json({ error: "Missing required fields: circular_id, map_id" });
      return;
    }
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
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

    // ── Create Submission record ───────────────────────────
    const submission = new Submission({
      circular_id: circular._id,
      circular_title: circular.title,
      map_id,
      map_action: map.action_title,
      department: map.department,
      file_path: file.path,
      original_filename: file.originalname,
      file_size: file.size,
      notes: notes || "",
      status: "submitted",
      submitted_at: new Date(),
    });

    await submission.save();

    // ── Run AI Validation ──────────────────────────────────
    console.log(`🤖 Starting AI Validation for ${submission._id}...`);
    try {
      const form = new FormData();
      form.append("proof_file", fs.createReadStream(file.path), file.originalname);
      form.append("original_map_action", map.action_title);
      form.append("original_map_department", map.department);

      const aiResponse = await axios.post("http://localhost:8000/validate", form, {
        headers: {
          ...form.getHeaders(),
        },
      });

      const verdictData = aiResponse.data;
      console.log(`🤖 AI Validation complete. Verdict: ${verdictData.verdict} (Confidence: ${verdictData.confidence})`);

      // Update Submission with verdict
      submission.ai_verdict = verdictData;
      submission.status = verdictData.verdict; // 'verified' or 'rejected'
      await submission.save();

      // Update parent Circular MAP status
      map.status = verdictData.verdict;
      await circular.save();
    } catch (aiErr: any) {
      console.error("❌ AI Validation failed:", aiErr.message);
      // We don't fail the submission upload if AI validation fails.
      // It stays in "submitted" status.
    }

    console.log(`✅ Proof submitted and evaluated: ${submission._id} for MAP ${map_id}`);

    res.status(201).json({
      message: "Proof of compliance submitted successfully",
      submission,
    });
  } catch (err) {
    console.error("❌ submitProof error:", err);
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
    const { department } = req.query;
    const filter = department ? { department: department as string } : {};
    const submissions = await Submission.find(filter).sort({ submitted_at: -1 });
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
    const submissions = await Submission.find({
      circular_id: req.params.circularId,
    }).sort({ submitted_at: -1 });
    res.json(submissions);
  } catch (err) {
    console.error("❌ getSubmissionsByCircular error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
