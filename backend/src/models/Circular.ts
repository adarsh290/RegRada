import mongoose, { Schema, Document } from "mongoose";

// ── MAP Sub-document ───────────────────────────────────────
export interface IMAP {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "submitted" | "verified" | "rejected";
  assigned_to: string;
}

const MAPSchema = new Schema<IMAP>(
  {
    map_id: { type: String, required: true },
    action_title: { type: String, required: true },
    department: { type: String, required: true },
    deadline: { type: String, required: true },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "submitted", "verified", "rejected"],
      default: "pending",
    },
    assigned_to: { type: String, required: true },
  },
  { _id: true }
);

// ── Circular Document ──────────────────────────────────────
export interface ICircular extends Document {
  title: string;
  source: string;
  raw_text: string;
  summary: string;
  extraction_mode: string;
  status: "pending" | "parsed" | "reviewed" | "archived";
  date_published: Date;
  maps: IMAP[];
  created_at: Date;
  updated_at: Date;
}

const CircularSchema = new Schema<ICircular>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    raw_text: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      default: "",
    },
    extraction_mode: {
      type: String,
      enum: ["llm_openai", "llm_local", "fallback", "legacy"],
      default: "legacy",
    },
    status: {
      type: String,
      enum: ["pending", "parsed", "reviewed", "archived"],
      default: "pending",
    },
    date_published: {
      type: Date,
      required: true,
    },
    maps: {
      type: [MAPSchema],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.model<ICircular>("Circular", CircularSchema);
