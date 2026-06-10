import mongoose, { Schema, Document } from 'mongoose';

export interface IReaction {
  emoji: string;
  userIds: mongoose.Types.ObjectId[];
}

export interface IMessage extends Document {
  orgId: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId; // null for org_chat
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'org_chat' | 'dm';
  mentions: mongoose.Types.ObjectId[]; // userIds @mentioned
  mentionAll: boolean;
  readBy: mongoose.Types.ObjectId[];
  parentId?: mongoose.Types.ObjectId; // Threading: Root message parent
  replyToId?: mongoose.Types.ObjectId; // Quoting / replying directly
  isForwarded?: boolean;
  reactions?: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String },
    content: { type: String, required: true, maxlength: 2000 },
    type: { type: String, enum: ['org_chat', 'dm'], required: true },
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    mentionAll: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    parentId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    replyToId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    isForwarded: { type: Boolean, default: false },
    reactions: [
      {
        emoji: { type: String, required: true },
        userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
  },
  { timestamps: true }
);

// Index for fast retrieval
MessageSchema.index({ orgId: 1, type: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
