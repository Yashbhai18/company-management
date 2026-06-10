import mongoose, { Schema, Document } from 'mongoose';

export interface IPending2faSession extends Document {
  userId: mongoose.Types.ObjectId;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
}

const Pending2faSessionSchema = new Schema<IPending2faSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  }
);

// TTL index to automatically remove the document when expiresAt timestamp is reached
Pending2faSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Pending2faSession = mongoose.model<IPending2faSession>('Pending2faSession', Pending2faSessionSchema);
