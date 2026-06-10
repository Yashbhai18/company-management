import { Request, Response } from 'express';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { User } from '../models/User';
import type { TokenPayload } from '../utils/token';
import mongoose from 'mongoose';

// Helper to attach threadCount aggregate
const attachThreadCounts = async (messages: any[]) => {
  if (!messages.length) return messages;
  const messageIds = messages.map(m => m._id);
  const counts = await Message.aggregate([
    { $match: { parentId: { $in: messageIds } } },
    { $group: { _id: '$parentId', count: { $sum: 1 } } }
  ]);
  const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));
  return messages.map(m => ({
    ...m,
    threadCount: countMap[m._id.toString()] || 0
  }));
};

/** GET /api/chat/org — last 50 org chat messages */
export const getOrgMessages = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const messages = await Message.find({ orgId, type: 'org_chat', parentId: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('replyToId')
      .lean();
      
    const enriched = await attachThreadCounts(messages);
    return res.json(enriched.reverse());
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** GET /api/chat/members — all org members for DM panel */
export const getOrgMembers = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const members = await User.find({ orgId, isActive: true, _id: { $ne: userId } })
      .select('_id name username avatar role')
      .lean();
    return res.json(members);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** GET /api/chat/conversations — DM conversation list for current user */
export const getConversations = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const convs = await Conversation.find({
      orgId,
      participants: new mongoose.Types.ObjectId(userId),
    })
      .sort({ lastMessageAt: -1 })
      .lean();

    // Enrich with other participant info
    const enriched = await Promise.all(
      convs.map(async (conv) => {
        const otherId = conv.participants.find((p) => p.toString() !== userId);
        const other = otherId
          ? await User.findById(otherId).select('name avatar').lean()
          : null;
        // Count unread for this user
        const unread = await Message.countDocuments({
          conversationId: conv._id,
          readBy: { $ne: new mongoose.Types.ObjectId(userId) },
        });
        return { ...conv, otherUser: other, unreadCount: unread };
      })
    );

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** GET /api/chat/dm/:recipientId — DM history with a specific user */
export const getDmHistory = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { recipientId } = req.params;
    const participantsSorted = [userId, recipientId as string].sort();
    const conversation = await Conversation.findOne({
      orgId,
      participants: { $all: participantsSorted, $size: 2 },
    });

    if (!conversation) return res.json({ conversationId: null, messages: [] });

    const messages = await Message.find({ conversationId: conversation._id, parentId: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('replyToId')
      .lean();

    // Mark as read
    await Message.updateMany(
      { conversationId: conversation._id, readBy: { $ne: new mongoose.Types.ObjectId(userId) } },
      { $addToSet: { readBy: userId } }
    );

    const enriched = await attachThreadCounts(messages);
    return res.json({ conversationId: conversation._id, messages: enriched.reverse() });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
