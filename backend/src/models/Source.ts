import mongoose, { Schema, Document } from 'mongoose';

export interface ISource extends Document {
  name: string;
  url: string;
  last_scraped?: Date;
  status: 'active' | 'error';
  created_at: Date;
}

const SourceSchema: Schema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  last_scraped: { type: Date },
  status: { type: String, enum: ['active', 'error'], default: 'active' },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model<ISource>('Source', SourceSchema);
