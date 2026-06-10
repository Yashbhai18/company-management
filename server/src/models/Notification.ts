import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  orgId: mongoose.Types.ObjectId;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt?: Date;
  actionUrl?: string;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    actionUrl: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-delete notification exactly 24 hours (86400 seconds) after it is marked as read
NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: 86400 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
