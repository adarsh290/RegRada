import mongoose, { Schema, Document } from "mongoose";

// ── Submission Document ─────────────────────────────────────
export interface IAIVerdict {
  is_compliant: boolean;
  confidence: number;
  reasoning: string;
  missing_items: string[];
  verdict: "verified" | "rejected";
  evaluated_at: Date;
}

export interface ISubmission extends Document {
  circular_id: mongoose.Types.ObjectId;
  circular_title: string;
  map_id: string;
  map_action: string;
  department: string;
  file_path: string;
  original_filename: string;
  file_size: number;
  notes: string;
  status: "submitted" | "verified" | "rejected";
  ai_verdict?: IAIVerdict;
  submitted_at: Date;
  reviewed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const AIVerdictSchema = new Schema<IAIVerdict>(
  {
    is_compliant: { type: Boolean, required: true },
    confidence: { type: Number, required: true },
    reasoning: { type: String, required: true },
    missing_items: { type: [String], default: [] },
    verdict: { type: String, enum: ["verified", "rejected"], required: true },
    evaluated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SubmissionSchema = new Schema<ISubmission>(
  {
    circular_id: {
      type: Schema.Types.ObjectId,
      ref: "Circular",
      required: true,
    },
    circular_title: { type: String, required: true },
    map_id: { type: String, required: true },
    map_action: { type: String, required: true },
    department: { type: String, required: true },
    file_path: { type: String, required: true },
    original_filename: { type: String, required: true },
    file_size: { type: Number, required: true },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["submitted", "verified", "rejected"],
      default: "submitted",
    },
    ai_verdict: { type: AIVerdictSchema },
    submitted_at: { type: Date, default: Date.now },
    reviewed_at: { type: Date },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.model<ISubmission>("Submission", SubmissionSchema);

