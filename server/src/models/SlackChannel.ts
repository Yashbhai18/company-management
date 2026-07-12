import mongoose, { Schema, Document } from 'mongoose';

export interface ISlackChannel extends Document {
  slackChannelId: string;
  workspaceId: string;
  orgId: mongoose.Types.ObjectId;
  name: string;
  topic?: string;
  purpose?: string;
  memberCount: number;
  unreadCount: number;
  lastMessageTs?: string;
  lastMessageText?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isIm: boolean;
  isMpim: boolean;
  /** Participant user ID if it's a DM */
  dmUserSlackId?: string | null;
  /** Sender user ID if it's a DM to map uniquely */
  senderSlackUserId?: string | null;
  /** Who created this DM mapping — 'user' token or 'bot' token */
  createdWith?: 'user' | 'bot' | null;
  /** Linked project — one channel maps to one project */
  linkedProjectId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SlackChannelSchema = new Schema<ISlackChannel>(
  {
    slackChannelId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    topic: { type: String },
    purpose: { type: String },
    memberCount: { type: Number, default: 0 },
    unreadCount: { type: Number, default: 0 },
    lastMessageTs: { type: String },
    lastMessageText: { type: String },
    isPrivate: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isIm: { type: Boolean, default: false },
    isMpim: { type: Boolean, default: false },
    dmUserSlackId: { type: String, default: null },
    senderSlackUserId: { type: String, default: null },
    createdWith: { type: String, enum: ['user', 'bot'], default: null },
    linkedProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  },
  { timestamps: true }
);

// Compound unique index: one channel ID per workspace
SlackChannelSchema.index({ slackChannelId: 1, workspaceId: 1 }, { unique: true });
SlackChannelSchema.index({ orgId: 1, isArchived: 1, name: 1 });

export const SlackChannel = mongoose.model<ISlackChannel>('SlackChannel', SlackChannelSchema);
