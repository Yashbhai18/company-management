import mongoose, { Schema, Document } from 'mongoose';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface ITimeOffRequest extends Document {
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: RequestStatus;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TimeOffRequestSchema = new Schema<ITimeOffRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

TimeOffRequestSchema.index({ userId: 1, createdAt: -1 });
TimeOffRequestSchema.index({ orgId: 1, status: 1 });

export const TimeOffRequest = mongoose.model<ITimeOffRequest>('TimeOffRequest', TimeOffRequestSchema);
