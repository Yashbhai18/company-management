import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  ownerId: mongoose.Types.ObjectId;
  memberIds: mongoose.Types.ObjectId[];
  startDate?: Date;
  endDate?: Date;
  color?: string;
  // ── Slack Integration ──
  slackChannelId?: string;
  slackWorkspaceId?: string;
  slackChannelName?: string;
  isSlackPrivate?: boolean;
  // ──────────────────────
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['active', 'on_hold', 'completed', 'archived'],
      default: 'active',
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    startDate: { type: Date },
    endDate: { type: Date },
    color: { type: String, default: '#6366f1' },
    // Slack channel link
    slackChannelId: { type: String, default: null },
    slackWorkspaceId: { type: String, default: null },
    slackChannelName: { type: String, default: null },
    isSlackPrivate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ProjectSchema.index({ orgId: 1, status: 1 });
ProjectSchema.index({ slackChannelId: 1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
