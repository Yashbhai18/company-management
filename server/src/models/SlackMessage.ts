import mongoose, { Schema, Document } from 'mongoose';

export interface ISlackReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ISlackFileRef {
  slackFileId: string;
  name: string;
  mimetype: string;
  size: number;
  permalink: string;
  previewUrl?: string;
  // NOTE: url_private intentionally NOT stored — always fetch fresh via files.info
}

export interface IThreadParticipant {
  displayName: string;
  avatar: string;
}

export interface IThreadSummary {
  replyCount: number;
  lastReplyAt: Date | string | null;
  participantCount: number;
  participants: IThreadParticipant[];
}

export interface ISlackMessage extends Document {
  /** Slack message timestamp (e.g. "1234567890.123456") — the Slack primary key */
  slackTs: string;
  channelId: string;
  workspaceId: string;
  orgId: mongoose.Types.ObjectId;
  /** Slack user ID of sender */
  senderSlackUserId: string;
  senderDisplayName?: string;
  senderAvatar?: string;
  /** If non-null, this is a thread reply; threadTs == the root message slackTs */
  threadTs?: string;
  isThreadReply?: boolean;
  parentTs?: string | null;
  thread?: IThreadSummary | null;
  /** Plain text */
  text: string;
  /** Slack Block Kit blocks (raw JSON) */
  blocks?: any[];
  reactions: ISlackReaction[];
  files: ISlackFileRef[];
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  /** Raw subtype from Slack, if any */
  subtype?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SlackReactionSchema = new Schema<ISlackReaction>({
  emoji: { type: String, required: true },
  count: { type: Number, default: 1 },
  userIds: [{ type: String }],
}, { _id: false });

const SlackFileRefSchema = new Schema<ISlackFileRef>({
  slackFileId: { type: String, required: true },
  name: { type: String, required: true },
  mimetype: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  permalink: { type: String, required: true },
  previewUrl: { type: String },
  // url_private intentionally NOT stored — Slack URLs expire; always re-fetch via files.info
}, { _id: false });

const ThreadParticipantSchema = new Schema<IThreadParticipant>({
  displayName: { type: String, required: true },
  avatar: { type: String, default: '' },
}, { _id: false });

const ThreadSummarySchema = new Schema<IThreadSummary>({
  replyCount: { type: Number, default: 0 },
  lastReplyAt: { type: Schema.Types.Mixed, default: null },
  participantCount: { type: Number, default: 0 },
  participants: { type: [ThreadParticipantSchema], default: [] },
}, { _id: false });

const SlackMessageSchema = new Schema<ISlackMessage>(
  {
    slackTs: { type: String, required: true },
    channelId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    senderSlackUserId: { type: String, required: true },
    senderDisplayName: { type: String },
    senderAvatar: { type: String },
    threadTs: { type: String, default: null },
    isThreadReply: { type: Boolean, default: false },
    parentTs: { type: String, default: null },
    thread: { type: ThreadSummarySchema, default: null },
    text: { type: String, default: '' },
    blocks: { type: [Schema.Types.Mixed], default: [] },
    reactions: { type: [SlackReactionSchema], default: [] },
    files: { type: [SlackFileRefSchema], default: [] },
    replyCount: { type: Number, default: 0 },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    subtype: { type: String },
  },
  { timestamps: true }
);

// Primary lookup: channel + ts (unique per channel)
SlackMessageSchema.index({ channelId: 1, slackTs: 1 }, { unique: true });
// Thread lookups
SlackMessageSchema.index({ threadTs: 1 });
// Full-text search fallback
SlackMessageSchema.index({ text: 'text' });
// Channel history scans
SlackMessageSchema.index({ channelId: 1, createdAt: -1 });

export const SlackMessage = mongoose.model<ISlackMessage>('SlackMessage', SlackMessageSchema);
