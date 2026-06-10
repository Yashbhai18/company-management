import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/token';
import { User } from '../models/User';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { notificationService } from '../services/notification.service';
import mongoose from 'mongoose';

interface AuthSocket extends Socket {
  userId: string;
  orgId: string;
  userName: string;
  userAvatar?: string;
  userRole: string;
  userEmail: string;
}

/** Parse @mentions from message content, returns { mentionAll, mentionedNames } */
function parseMentions(content: string): { mentionAll: boolean; mentionedNames: string[] } {
  const mentionAll = /@all\b/i.test(content);
  // Match usernames which typically have alphanumeric and underscore characters (no spaces!)
  const nameMatches = content.match(/@([a-zA-Z0-9_]+?)(?=\s|$|[^a-zA-Z0-9_])/g) || [];
  const mentionedNames = nameMatches
    .map((m) => m.slice(1).trim().toLowerCase())
    .filter((n) => n !== 'all');
  return { mentionAll, mentionedNames };
}

import { TimeEntry } from '../models/TimeEntry';

let globalIO: SocketIOServer | null = null;
const pendingClockOuts = new Map<string, NodeJS.Timeout>();

/** Decoupled getter to allow REST controllers to tap into WebSocket relays */
export const getSocketIO = () => globalIO;

export function initChatGateway(io: SocketIOServer) {
  globalIO = io;
  // Auth middleware for every socket connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) return next(new Error('No token'));
      const payload = verifyAccessToken(token);
      const authSocket = socket as AuthSocket;
      authSocket.userId = payload.userId;
      authSocket.orgId = payload.orgId;
      // Fetch name, role, and email for global connection & auto attendance logic
      const user = await User.findById(payload.userId).select('name avatar role email').lean();
      authSocket.userName = (user as any)?.name || 'Unknown';
      authSocket.userAvatar = (user as any)?.avatar;
      authSocket.userRole = (user as any)?.role || 'employee';
      authSocket.userEmail = (user as any)?.email || '';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthSocket;

    // Join org broadcast room, personal room, and cross-workspace email room for identity tracking
    socket.join(`org:${socket.orgId}`);
    socket.join(`user:${socket.userId}`);
    if (socket.userEmail) {
      socket.join(`email:${socket.userEmail.toLowerCase()}`);
    }

    console.info(`[chat] ${socket.userName} connected (org:${socket.orgId}, role:${socket.userRole}, email:${socket.userEmail})`);

    // If the user is an employee, manage multi-workspace automatic clock-in
    if (socket.userRole === 'employee' && socket.userEmail) {
      const emailKey = socket.userEmail.toLowerCase();

      // A: Cancel any pending clock-out timeouts for this identity
      if (pendingClockOuts.has(emailKey)) {
        clearTimeout(pendingClockOuts.get(emailKey)!);
        pendingClockOuts.delete(emailKey);
        console.info(`[attendance] Canceled scheduled clock-out for user ${socket.userName} (${emailKey})`);
      }

      // NOTE: Automatic clock-in on connection removed per user request.
      // Employees must now manually clock in via the Dashboard.
    }

    // Helper to attach threadCount aggregate to a set of messages
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

    // ─── Load org chat history ───────────────────────────────────────────────
    socket.on('chat:load_history_org', async () => {
      try {
        // Only load root messages (parentId == null) for main timeline
        const messages = await Message.find({ orgId: socket.orgId, type: 'org_chat', parentId: null })
          .sort({ createdAt: -1 })
          .limit(50)
          .populate('replyToId')
          .lean();
        
        const messagesWithCounts = await attachThreadCounts(messages);
        socket.emit('chat:history_org', messagesWithCounts.reverse());
      } catch (err) {
        console.error('[chat] load org history error', err);
      }
    });

    // ─── Load DM history ─────────────────────────────────────────────────────
    socket.on('chat:load_history_dm', async ({ conversationId }: { conversationId: string }) => {
      try {
        // Only load root messages (parentId == null) for main timeline
        const messages = await Message.find({ conversationId, parentId: null })
          .sort({ createdAt: -1 })
          .limit(50)
          .populate('replyToId')
          .lean();
          
        // mark as read
        await Message.updateMany(
          { conversationId, readBy: { $ne: new mongoose.Types.ObjectId(socket.userId) } },
          { $addToSet: { readBy: socket.userId } }
        );
        
        const messagesWithCounts = await attachThreadCounts(messages);
        socket.emit('chat:history_dm', { conversationId, messages: messagesWithCounts.reverse() });
      } catch (err) {
        console.error('[chat] load dm history error', err);
      }
    });

    // ─── Load Thread history ──────────────────────────────────────────────────
    socket.on('chat:load_thread', async ({ messageId }: { messageId: string }) => {
      try {
        const parent = await Message.findById(messageId).populate('replyToId').lean();
        if (!parent) return;

        const replies = await Message.find({ parentId: messageId })
          .sort({ createdAt: 1 })
          .populate('replyToId')
          .lean();

        socket.emit('chat:thread_history', { parent, replies });
      } catch (err) {
        console.error('[chat] load thread error', err);
      }
    });

    // ─── React to Message ────────────────────────────────────────────────────
    socket.on('chat:react', async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!messageId || !emoji) return;
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;

        if (!msg.reactions) msg.reactions = [];

        const uId = new mongoose.Types.ObjectId(socket.userId);

        // Step 1: Scan existing reactions and remove this user from ALL of them
        let toggledOffSameEmoji = false;
        
        msg.reactions.forEach((r: any) => {
          const userIdx = r.userIds.findIndex((uid: any) => uid.toString() === socket.userId);
          if (userIdx > -1) {
            if (r.emoji === emoji) {
              toggledOffSameEmoji = true;
            }
            r.userIds.splice(userIdx, 1);
          }
        });

        // Clean up and filter out any empty reaction groups
        msg.reactions = msg.reactions.filter((r: any) => r.userIds.length > 0);

        // Step 2: If user wasn't toggling the exact same emoji off, apply the new reaction group
        if (!toggledOffSameEmoji) {
          const targetReaction = msg.reactions.find((r: any) => r.emoji === emoji);
          if (!targetReaction) {
            msg.reactions.push({ emoji, userIds: [uId] });
          } else {
            targetReaction.userIds.push(uId);
          }
        }

        await msg.save();

        // Retrieve fully populated message object for UI propagation
        const updatedMsgObj = await Message.findById(messageId).populate('replyToId').lean();
        
        // If this is a thread reply, we also want to compute if root message UI needs updates.
        // But simplest is to broad-broadcast update.
        if (msg.type === 'org_chat') {
          io.to(`org:${socket.orgId}`).emit('chat:message_updated', updatedMsgObj);
        } else if (msg.conversationId) {
          const conv = await Conversation.findById(msg.conversationId).lean();
          if (conv) {
            for (const participantId of conv.participants) {
              io.to(`user:${participantId}`).emit('chat:message_updated', updatedMsgObj);
            }
          }
        }
      } catch (err) {
        console.error('[chat] react error', err);
      }
    });

    // ─── Send org chat message ───────────────────────────────────────────────
    socket.on('chat:send_org', async ({ content, parentId, replyToId, isForwarded }: { content: string; parentId?: string; replyToId?: string; isForwarded?: boolean }) => {
      if (!content?.trim()) return;
      try {
        const { mentionAll, mentionedNames } = parseMentions(content);

        // Resolve @mentioned usernames to user ids
        const mentionedUsers = mentionedNames.length
          ? await User.find({ orgId: socket.orgId, username: { $in: mentionedNames } }).select('_id username').lean()
          : [];
        const mentionIds = mentionedUsers.map((u) => u._id);

        const message = await Message.create({
          orgId: socket.orgId,
          senderId: socket.userId,
          senderName: socket.userName,
          senderAvatar: socket.userAvatar,
          content: content.trim(),
          type: 'org_chat',
          mentions: mentionIds,
          mentionAll,
          readBy: [socket.userId],
          parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
          replyToId: replyToId ? new mongoose.Types.ObjectId(replyToId) : undefined,
          isForwarded: !!isForwarded,
        });

        const msgObj = await Message.findById(message._id).populate('replyToId').lean();

        // Broadcast to whole org
        io.to(`org:${socket.orgId}`).emit('chat:org_message', msgObj);

        // If this was a thread reply, notify the org to update the thread count on the parent row!
        if (parentId) {
          const newCount = await Message.countDocuments({ parentId });
          io.to(`org:${socket.orgId}`).emit('chat:thread_count_updated', { parentId, threadCount: newCount });
        }

        // Notify ALL other organization members + super admins of this new message!
        const allOtherUsers = await User.find({ 
          orgId: socket.orgId, 
          _id: { $ne: socket.userId },
          isActive: true 
        }).select('_id').lean();

        for (const targetUser of allOtherUsers) {
          const targetIdStr = targetUser._id.toString();
          const isMentioned = mentionAll || mentionIds.some(mid => mid.toString() === targetIdStr);
          
          const titlePrefix = isMentioned ? '📢 Tagged in ' : '💬 New message in ';
          
          await notificationService.createNotification({
            userId: targetIdStr,
            orgId: socket.orgId,
            type: 'chat_message',
            title: `${titlePrefix}Org Chat by ${socket.userName}`,
            message: content.trim().slice(0, 80),
            actionUrl: '/chat?view=org',
          });

          io.to(`user:${targetIdStr}`).emit('notification:new');
        }
      } catch (err) {
        console.error('[chat] send org error', err);
      }
    });

    // ─── Send DM ─────────────────────────────────────────────────────────────
    socket.on('chat:send_dm', async ({ recipientId, content, parentId, replyToId, isForwarded }: { recipientId: string; content: string; parentId?: string; replyToId?: string; isForwarded?: boolean }) => {
      if (!content?.trim() || !recipientId) return;
      try {
        // Find or create conversation
        const participantsSorted = [socket.userId, recipientId].sort();
        let conversation = await Conversation.findOne({
          orgId: socket.orgId,
          participants: { $all: participantsSorted, $size: 2 },
        });
        if (!conversation) {
          conversation = await Conversation.create({
            orgId: socket.orgId,
            participants: participantsSorted,
            lastMessage: isForwarded ? 'Forwarded message' : content.trim().slice(0, 100),
            lastMessageAt: new Date(),
            lastSenderId: socket.userId,
          });
        } else {
          conversation.lastMessage = isForwarded ? 'Forwarded message' : content.trim().slice(0, 100);
          conversation.lastMessageAt = new Date();
          conversation.lastSenderId = new mongoose.Types.ObjectId(socket.userId);
          await conversation.save();
        }

        const message = await Message.create({
          orgId: socket.orgId,
          conversationId: conversation._id,
          senderId: socket.userId,
          senderName: socket.userName,
          senderAvatar: socket.userAvatar,
          content: content.trim(),
          type: 'dm',
          mentions: [],
          mentionAll: false,
          readBy: [socket.userId],
          parentId: parentId ? new mongoose.Types.ObjectId(parentId) : undefined,
          replyToId: replyToId ? new mongoose.Types.ObjectId(replyToId) : undefined,
          isForwarded: !!isForwarded,
        });

        const msgObj = await Message.findById(message._id).populate('replyToId').lean();
        const convId = conversation._id.toString();

        // Deliver to both participants
        io.to(`user:${socket.userId}`).emit('chat:dm_message', { conversationId: convId, message: msgObj });
        io.to(`user:${recipientId}`).emit('chat:dm_message', { conversationId: convId, message: msgObj });

        // Notify frontend if this updates thread count
        if (parentId) {
          const newCount = await Message.countDocuments({ parentId });
          const payload = { parentId, threadCount: newCount };
          io.to(`user:${socket.userId}`).emit('chat:thread_count_updated', payload);
          io.to(`user:${recipientId}`).emit('chat:thread_count_updated', payload);
        }

        // Notify recipient
        await notificationService.createNotification({
          userId: recipientId,
          orgId: socket.orgId,
          type: 'chat_dm',
          title: `New message from ${socket.userName}`,
          message: content.trim().slice(0, 80),
          actionUrl: `/chat?dm=${socket.userId}`,
        });
        io.to(`user:${recipientId}`).emit('notification:new');
      } catch (err) {
        console.error('[chat] send DM error', err);
      }
    });

    // ─── Mark DM as read ─────────────────────────────────────────────────────
    socket.on('chat:mark_read', async ({ conversationId }: { conversationId: string }) => {
      try {
        await Message.updateMany(
          { conversationId, readBy: { $ne: new mongoose.Types.ObjectId(socket.userId) } },
          { $addToSet: { readBy: socket.userId } }
        );
      } catch (err) {
        console.error('[chat] mark read error', err);
      }
    });

    // ─── Typing Indicator ───────────────────────────────────────────────────
    socket.on('chat:typing', ({ isTyping, targetView }: { isTyping: boolean; targetView: string }) => {
      try {
        if (targetView === 'org') {
          socket.to(`org:${socket.orgId}`).emit('chat:typing_update', {
            userId: socket.userId,
            userName: socket.userName,
            isTyping,
            view: 'org'
          });
        } else {
          io.to(`user:${targetView}`).emit('chat:typing_update', {
            userId: socket.userId,
            userName: socket.userName,
            isTyping,
            view: socket.userId 
          });
        }
      } catch (err) {
        console.error('[chat] typing event error', err);
      }
    });

    socket.on('disconnect', async () => {
      console.info(`[chat] ${socket.userName} disconnected`);

      if (socket.userRole === 'employee' && socket.userEmail && globalIO) {
        const emailKey = socket.userEmail.toLowerCase();
        
        // Crucial change: Check if any tabs remain open across ANY workspace (globally)
        const activeIdentityConnections = await globalIO.in(`email:${emailKey}`).fetchSockets();
        
        if (activeIdentityConnections.length === 0) {
          console.info(`[attendance] All workspace tabs closed for ${socket.userName}. Scheduling cross-workspace clock-out in 15s.`);
          
          if (pendingClockOuts.has(emailKey)) {
            clearTimeout(pendingClockOuts.get(emailKey)!);
          }

          const timeout = setTimeout(async () => {
            try {
              if (globalIO) {
                // Verify that no tabs were opened/reconnected during the window
                const currentConnections = await globalIO.in(`email:${emailKey}`).fetchSockets();
                if (currentConnections.length === 0) {
                  // Fetch all user IDs sharing this identity email
                  const identityProfiles = await User.find({ email: emailKey }).select('_id').lean();
                  const allIdentityUserIds = identityProfiles.map(p => p._id);

                  // Perform broad sweep: Clock out of EVERY active workspace concurrently!
                  const activeShifts = await TimeEntry.find({ 
                    userId: { $in: allIdentityUserIds }, 
                    clockOut: { $exists: false } 
                  });

                  if (activeShifts.length > 0) {
                    const now = new Date();
                    for (const shift of activeShifts) {
                      const diffMs = now.getTime() - shift.clockIn.getTime();
                      const minutes = Math.floor(diffMs / (1000 * 60));
                      shift.clockOut = now;
                      shift.durationMinutes = Math.max(0, minutes);
                      await shift.save();
                    }
                    console.info(`[attendance] Auto clocked out user ${emailKey} from ${activeShifts.length} workspaces globally.`);
                  }
                }
              }
              pendingClockOuts.delete(emailKey);
            } catch (err) {
              console.error('[attendance] Cross-workspace auto-clock-out error:', err);
            }
          }, 15000);

          pendingClockOuts.set(emailKey, timeout);
        } else {
          console.info(`[attendance] User ${emailKey} still has active tabs open elsewhere. Sustaining connection state.`);
        }
      }
    });
  });
}
