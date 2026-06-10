import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeEntry extends Document {
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  clockIn: Date;
  clockOut?: Date;
  durationMinutes?: number;
  note?: string;
  locationStatus?: 'on-site' | 'wfh';
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

const timeEntrySchema = new Schema<ITimeEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    clockIn: { type: Date, required: true },
    clockOut: { type: Date },
    durationMinutes: { type: Number, default: 0 },
    note: { type: String },
    locationStatus: { type: String, enum: ['on-site', 'wfh'] },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { timestamps: true }
);

// Index for fast retrieval of user's timeline
timeEntrySchema.index({ userId: 1, clockIn: -1 });

export const TimeEntry = mongoose.model<ITimeEntry>('TimeEntry', timeEntrySchema);
