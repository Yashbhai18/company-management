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

/** GET /api/chat/conversations — conversation list for current user */
export const getConversations = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const convs = await Conversation.find({
      orgId,
      participants: new mongoose.Types.ObjectId(userId),
    })
      .sort({ lastMessageAt: -1 })
      .lean();

    // Enrich with participant info
    const enriched = await Promise.all(
      convs.map(async (conv) => {
        const participantProfiles = await User.find({
          _id: { $in: conv.participants }
        }).select('_id name avatar').lean();

        const otherParticipants = participantProfiles.filter((p) => p._id.toString() !== userId);
        const other = otherParticipants[0] || null;

        // Count unread for this user
        const unread = await Message.countDocuments({
          conversationId: conv._id,
          readBy: { $ne: new mongoose.Types.ObjectId(userId) },
        });

        return { 
          ...conv, 
          otherUser: other, 
          otherParticipants,
          unreadCount: unread 
        };
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

/** POST /api/chat/group — Create a new group chat conversation */
export const createGroupConversation = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { name, participantIds } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ message: 'At least one participant is required.' });
    }

    // Include the creator in the participants list
    const allParticipantIds = Array.from(new Set([userId, ...participantIds]))
      .map(id => new mongoose.Types.ObjectId(id));

    const conversation = await Conversation.create({
      orgId: new mongoose.Types.ObjectId(orgId),
      participants: allParticipantIds,
      isGroup: true,
      name: name.trim(),
      lastMessage: 'Group created',
      lastMessageAt: new Date(),
      lastSenderId: new mongoose.Types.ObjectId(userId),
    });

    // Create a system message
    await Message.create({
      orgId: new mongoose.Types.ObjectId(orgId),
      conversationId: conversation._id,
      senderId: new mongoose.Types.ObjectId(userId),
      senderName: 'System',
      content: `Group "${name.trim()}" created.`,
      type: 'dm',
      readBy: [userId],
    });

    // Notify all participants via socket if connected
    const io = (await import('../gateway/chat.gateway')).getSocketIO();
    if (io) {
      for (const participantId of allParticipantIds) {
        io.to(`user:${participantId.toString()}`).emit('chat:conversation_created');
      }
    }

    return res.status(201).json(conversation);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** GET /api/chat/conversations/:conversationId — Fetch conversation history by ID */
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user as TokenPayload;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: new mongoose.Types.ObjectId(userId)
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied: not a participant.' });
    }

    const messages = await Message.find({ conversationId, parentId: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('replyToId')
      .lean();

    // Mark as read
    await Message.updateMany(
      { conversationId, readBy: { $ne: new mongoose.Types.ObjectId(userId) } },
      { $addToSet: { readBy: userId } }
    );

    const enriched = await attachThreadCounts(messages);
    return res.json({ conversationId, messages: enriched.reverse() });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
