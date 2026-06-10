import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  orgId: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[]; // exactly 2 for DMs
  lastMessage: string;
  lastMessageAt: Date;
  lastSenderId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastSenderId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Unique DM thread per pair (sorted participant ids)
ConversationSchema.index({ orgId: 1, participants: 1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
