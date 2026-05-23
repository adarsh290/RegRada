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
      validate: {
        validator: function (this: any, value: string) {
          if (this.role === "DEPARTMENT" && (!value || value.trim() === "")) return false;
          return true;
        },
        message: "department_name is required for DEPARTMENT role",
      },
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator: function (v: string) {
          return v ? require("validator").isEmail(v) : true;
        },
        message: "Invalid email format",
      },
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at" },
  }
);

export default mongoose.model<IUser>("User", UserSchema);
