import mongoose, { Schema, Document } from 'mongoose';
import { encryptToken, decryptToken, isEncryptedToken } from '../utils/slackCrypto';

export interface ISlackWorkspace extends Document {
  orgId: mongoose.Types.ObjectId;
  /** Slack workspace/team ID (e.g. "T01234ABC") */
  workspaceId: string;
  teamName: string;
  /** AES-256-GCM encrypted bot token */
  botTokenEncrypted: string;
  /** AES-256-GCM encrypted user OAuth access token */
  accessTokenEncrypted?: string;
  installedBy: mongoose.Types.ObjectId;
  scope: string;
  botUserId?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** Virtual: decrypted bot token — never persisted */
  getBotToken(): string;
  /** Virtual: decrypted access token — never persisted */
  getAccessToken(): string | null;
}

const SlackWorkspaceSchema = new Schema<ISlackWorkspace>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    workspaceId: { type: String, required: true, index: true },
    teamName: { type: String, required: true },
    botTokenEncrypted: { type: String, required: true },
    accessTokenEncrypted: { type: String },
    installedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, default: '' },
    botUserId: { type: String },
    isActive: { type: Boolean, default: true },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

/** Encrypt bot token before saving if it is a raw (unencrypted) string */
SlackWorkspaceSchema.pre('save', async function (this: ISlackWorkspace) {
  if (this.isModified('botTokenEncrypted') && !isEncryptedToken(this.botTokenEncrypted)) {
    this.botTokenEncrypted = encryptToken(this.botTokenEncrypted);
  }
  if (this.accessTokenEncrypted && this.isModified('accessTokenEncrypted') && !isEncryptedToken(this.accessTokenEncrypted)) {
    this.accessTokenEncrypted = encryptToken(this.accessTokenEncrypted);
  }
});

SlackWorkspaceSchema.methods.getBotToken = function (this: ISlackWorkspace): string {
  if (!isEncryptedToken(this.botTokenEncrypted)) {
    return this.botTokenEncrypted;
  }
  return decryptToken(this.botTokenEncrypted);
};

SlackWorkspaceSchema.methods.getAccessToken = function (this: ISlackWorkspace): string | null {
  if (!this.accessTokenEncrypted) return null;
  if (!isEncryptedToken(this.accessTokenEncrypted)) {
    return this.accessTokenEncrypted;
  }
  return decryptToken(this.accessTokenEncrypted);
};

export const SlackWorkspace = mongoose.model<ISlackWorkspace>('SlackWorkspace', SlackWorkspaceSchema);
