import mongoose, { Schema, Document } from 'mongoose';

export interface IMagicLink extends Document {
  userId: mongoose.Types.ObjectId;
  token: string; // hashed
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const MagicLinkSchema = new Schema<IMagicLink>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, index: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const MagicLink = mongoose.model<IMagicLink>('MagicLink', MagicLinkSchema);
