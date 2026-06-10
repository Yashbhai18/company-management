import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import type { TokenPayload } from '../utils/token';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const notifications = await notificationService.getNotificationsForUser(authed.userId, authed.orgId);
    
    const unreadCount = notifications.filter(n => !n.read).length;

    return res.json({ notifications, unreadCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    await notificationService.markAllAsRead(authed.userId, authed.orgId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const markRead = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const { notificationId } = req.params;
    await notificationService.markAsRead(notificationId as string, authed.userId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const { notificationId } = req.params;
    await notificationService.deleteNotification(notificationId as string, authed.userId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
