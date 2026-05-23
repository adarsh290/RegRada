import mongoose, { Schema, Document } from "mongoose";

// ── MAP Sub-document ───────────────────────────────────────
export interface IMAP {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: "high" | "medium" | "low";
  status: "pending_review" | "pending" | "in_progress" | "submitted" | "verified" | "rejected" | "escalated";
  assigned_to: string;
  rejection_count: number;
  audit_trail: { action: string; by: string; comment: string; timestamp: Date }[];
  action_confidence?: number;
  dept_confidence?: number;
  deadline_confidence?: number;
  confidence?: number;
  confidence_flags?: string[];
  needs_co_review?: boolean;
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
      enum: ["pending_review", "pending", "in_progress", "submitted", "verified", "rejected", "escalated"],
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
    action_confidence: { type: Number, default: 1.0 },
    dept_confidence: { type: Number, default: 1.0 },
    deadline_confidence: { type: Number, default: 1.0 },
    confidence: { type: Number, default: 1.0 },
    confidence_flags: { type: [String], default: [] },
    needs_co_review: { type: Boolean, default: false },
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
  // BUG-BE2-028: type was string, making populate() fail. Use ObjectId.
  amends?: mongoose.Types.ObjectId;
  delta_report?: {
    deadline_changes: { map_id: string; old_deadline: string; new_deadline: string }[];
    clause_modifications: { map_id: string; summary: string }[];
    obligations_added: string[];
    obligations_removed: string[];
    generated_at: Date;
  };
  has_conflicts: boolean;
  conflicts: {
    map_id_a: string;
    circular_id_a: string;
    map_id_b: string;
    circular_id_b: string;
    conflict_type: "deadline_conflict" | "contradictory_requirement" | "jurisdiction_overlap";
    explanation: string;
    severity: "high" | "medium" | "low";
    resolved: boolean;
    resolved_by_co?: string;
  }[];
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
      maxlength: 500000, // BUG-SEC-025: Add maxlength to prevent MongoDB document size limits / ReDoS
    },
    summary: {
      type: String,
      default: "",
    },
    extraction_mode: {
      type: String,
      enum: ["llm_openai", "llm_local", "fallback", "legacy", "scraper"],
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
      // BUG-SEC-029: Moved validation to pre-save hook for reliability
    },
    // BUG-BE2-028: type was String, making populate() fail. Use ObjectId.
    amends: { type: Schema.Types.ObjectId, ref: "Circular" },
    delta_report: {
      deadline_changes: [{ map_id: String, old_deadline: String, new_deadline: String }],
      clause_modifications: [{ map_id: String, summary: String }],
      obligations_added: [String],
      obligations_removed: [String],
      generated_at: Date,
    },
    has_conflicts: { type: Boolean, default: false },
    conflicts: {
      type: [{
        map_id_a: String,
        circular_id_a: String,
        map_id_b: String,
        circular_id_b: String,
        conflict_type: { type: String, enum: ['deadline_conflict', 'contradictory_requirement', 'jurisdiction_overlap'] },
        explanation: String,
        severity: { type: String, enum: ['high', 'medium', 'low'] },
        resolved: { type: Boolean, default: false },
        resolved_by_co: String,
      }],
      default: [],
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// BUG-SEC-024: Add pre-save hook to ensure map_id uniqueness and validate dependency edges
CircularSchema.pre('save', function(next) {
  if (this.maps && this.maps.length > 0) {
    const mapIds = this.maps.map(m => m.map_id);
    const uniqueMapIds = new Set(mapIds);
    if (mapIds.length !== uniqueMapIds.size) {
      return next(new Error("Validation failed: Duplicate map_ids found in maps array."));
    }
    
    // BUG-SEC-029: Validate dependency edges using reliable context
    if (this.dependency_edges && this.dependency_edges.length > 0) {
      const invalidEdges = this.dependency_edges.filter(
        e => !uniqueMapIds.has(e.from_map_id) || !uniqueMapIds.has(e.to_map_id)
      );
      if (invalidEdges.length > 0) {
        return next(new Error("Validation failed: Dependency edges must reference valid map_ids in this circular."));
      }
    }
  }
  next();
});

CircularSchema.index({ created_at: -1 });
CircularSchema.index({ source: 1, title: 1 }, { unique: true }); // BUG-SEC-026: Add unique index to prevent duplicate ingestion
CircularSchema.index({ has_conflicts: 1 });
CircularSchema.index({ "maps.status": 1 });
CircularSchema.index({ "maps.department": 1 });
CircularSchema.index({ "maps.deadline": 1 });

export default mongoose.model<ICircular>("Circular", CircularSchema);
