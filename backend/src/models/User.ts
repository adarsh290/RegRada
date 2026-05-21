import mongoose, { Schema, Document } from "mongoose";

// ── User Document ────────────────────────────────────────────
export interface IUser extends Document {
  username: string;
  password_hash: string;
  role: "CO" | "DEPARTMENT";
  department_name?: string;
  email?: string;
  created_at: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["CO", "DEPARTMENT"],
      required: true,
    },
    department_name: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at" },
  }
);

export default mongoose.model<IUser>("User", UserSchema);
