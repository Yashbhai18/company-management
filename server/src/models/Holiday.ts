import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
  orgId: mongoose.Types.ObjectId;
  type: 'whole_org' | 'individual';
  targetUserIds?: mongoose.Types.ObjectId[];
  startDate: Date;
  endDate: Date;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema = new Schema<IHoliday>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, enum: ['whole_org', 'individual'], required: true },
    targetUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

// Fast lookups for an org and its holidays
HolidaySchema.index({ orgId: 1, startDate: -1 });

export const Holiday = mongoose.model<IHoliday>('Holiday', HolidaySchema);
