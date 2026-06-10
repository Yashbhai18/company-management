import mongoose, { Schema, Document } from 'mongoose';

export interface ITeam extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  members: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  },
  { timestamps: true }
);

// Indexes
TeamSchema.index({ orgId: 1 });

export const Team = mongoose.model<ITeam>('Team', TeamSchema);
