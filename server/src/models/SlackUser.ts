import mongoose, { Schema, Document } from 'mongoose';

export interface ISlackUser extends Document {
  slackUserId: string;
  workspaceId: string;
  orgId: mongoose.Types.ObjectId;
  name: string;
  displayName: string;
  realName?: string;
  email?: string;
  avatar?: string;
  avatarHash?: string;
  timezone?: string;
  timezoneOffset?: number;
  presence: 'active' | 'away';
  statusText?: string;
  statusEmoji?: string;
  isBot: boolean;
  isDeleted: boolean;
  /** Reference to the local User doc if they are also a platform user */
  localUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SlackUserSchema = new Schema<ISlackUser>(
  {
    slackUserId: { type: String, required: true },
    workspaceId: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true },
    displayName: { type: String, default: '' },
    realName: { type: String },
    email: { type: String, lowercase: true },
    avatar: { type: String },
    avatarHash: { type: String },
    timezone: { type: String },
    timezoneOffset: { type: Number },
    presence: { type: String, enum: ['active', 'away'], default: 'away' },
    statusText: { type: String },
    statusEmoji: { type: String },
    isBot: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    localUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

SlackUserSchema.index({ slackUserId: 1, workspaceId: 1 }, { unique: true });
SlackUserSchema.index({ orgId: 1, email: 1 });

export const SlackUser = mongoose.model<ISlackUser>('SlackUser', SlackUserSchema);
