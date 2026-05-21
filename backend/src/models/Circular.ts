import mongoose, { Schema, Document } from "mongoose";

// ── MAP Sub-document ───────────────────────────────────────
export interface IMAP {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "submitted" | "verified" | "rejected" | "escalated";
  assigned_to: string;
  rejection_count: number;
  audit_trail: { action: string; by: string; comment: string; timestamp: Date }[];
}

// ── Dependency Edge Sub-document ─────────────────────────
export interface IDependencyEdge {
  from_map_id: string;
  to_map_id: string;
  constraint: string;
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
      enum: ["pending", "in_progress", "submitted", "verified", "rejected", "escalated"],
      default: "pending",
    },
    assigned_to: { type: String, required: true },
    rejection_count: { type: Number, default: 0 },
    audit_trail: {
      type: [{
        action: String,
        by: String,
        comment: String,
        timestamp: { type: Date, default: Date.now },
      }],
      default: [],
    },
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
  dependency_edges: IDependencyEdge[];
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
    dependency_edges: {
      type: [{
        from_map_id: { type: String, required: true },
        to_map_id: { type: String, required: true },
        constraint: { type: String, required: true },
      }],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export default mongoose.model<ICircular>("Circular", CircularSchema);
