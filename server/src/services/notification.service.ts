import { Notification } from '../models/Notification';
import { User } from '../models/User';
import mongoose from 'mongoose';
import { getSocketIO } from '../gateway/socket';

const pushNotifSocket = (userId: string, notification: any) => {
  try {
    const io = getSocketIO();
    if (io) {
      io.to(`user:${userId}`).emit('notification:new', notification);
    }
  } catch (err) {
    console.error('[Notification Service] Socket push failed:', err);
  }
};

export const notificationService = {
  createNotification: async (params: {
    userId: string | mongoose.Types.ObjectId;
    orgId: string | mongoose.Types.ObjectId;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
  }) => {
    const notif = await Notification.create({
      userId: new mongoose.Types.ObjectId(params.userId as string),
      orgId: new mongoose.Types.ObjectId(params.orgId as string),
      type: params.type,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
    });

    pushNotifSocket(params.userId.toString(), notif.toObject());
    return notif;
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
      const created = await Notification.insertMany(notifications);
      created.forEach((notif) => {
        pushNotifSocket(notif.userId.toString(), notif.toObject ? notif.toObject() : notif);
      });
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
