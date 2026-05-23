import mongoose, { Schema, Document } from 'mongoose';

export interface ISource extends Document {
  name: string;
  url: string;
  last_scraped?: Date;
  status: 'active' | 'error';
  created_at: Date;
  updated_at: Date;
}

// BUG-BE2-034: Added generic type parameter to Schema
const SourceSchema = new Schema<ISource>({
  name: { type: String, required: true },
  url: { type: String, required: true, unique: true },
  last_scraped: { type: Date },
  status: { type: String, enum: ['active', 'error'], default: 'active' },
}, {
  timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
});

export default mongoose.model<ISource>('Source', SourceSchema);
