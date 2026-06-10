import { Notification } from '../models/Notification';
import { User } from '../models/User';
import mongoose from 'mongoose';

export const notificationService = {
  createNotification: async (params: {
    userId: string | mongoose.Types.ObjectId;
    orgId: string | mongoose.Types.ObjectId;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
  }) => {
    return Notification.create({
      userId: new mongoose.Types.ObjectId(params.userId as string),
      orgId: new mongoose.Types.ObjectId(params.orgId as string),
      type: params.type,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
    });
  },

  notifyAdmins: async (orgId: string | mongoose.Types.ObjectId, params: {
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
  }) => {
    const admins = await User.find({
      orgId: new mongoose.Types.ObjectId(orgId as string),
      role: { $in: ['admin', 'super_admin'] },
    });

    const notifications = admins.map((admin) => ({
      userId: admin._id,
      orgId: new mongoose.Types.ObjectId(orgId as string),
      type: params.type,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  },

  getNotificationsForUser: async (userId: string, orgId: string) => {
    return Notification.find({
      userId: new mongoose.Types.ObjectId(userId),
      orgId: new mongoose.Types.ObjectId(orgId),
    }).sort({ createdAt: -1 }).limit(50);
  },

  markAllAsRead: async (userId: string, orgId: string) => {
    return Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        orgId: new mongoose.Types.ObjectId(orgId),
        read: false,
      },
      { $set: { read: true, readAt: new Date() } }
    );
  },
  
  markAsRead: async (notificationId: string, userId: string) => {
    return Notification.updateOne(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { $set: { read: true, readAt: new Date() } }
    );
  },

  deleteNotification: async (notificationId: string, userId: string) => {
    return Notification.deleteOne({
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId),
    });
  },
};
