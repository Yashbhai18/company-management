import { Server as SocketIOServer } from 'socket.io';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackMessage } from '../../models/SlackMessage';
import { SlackChannel } from '../../models/SlackChannel';
import { SlackUser } from '../../models/SlackUser';
import * as messagesService from './messages.service';

/** Helper: get orgId from workspaceId */
async function getOrgId(workspaceId: string): Promise<string | null> {
  const ws = await SlackWorkspace.findOne({ workspaceId, isActive: true }).select('orgId').lean();
  return ws ? (ws as any).orgId.toString() : null;
}

let globalIO: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer) {
  globalIO = io;
}

/** Emit a Slack event to all sockets in the org room */
export function broadcastToOrg(orgId: string, event: string, payload: any) {
  if (!globalIO) return;
  globalIO.to(`org:${orgId}`).emit(event, payload);
}

// ── Event Handlers ──────────────────────────────────────────────────────────

export async function onMessageCreated(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const channelId = event.channel;
  const senderCache = await SlackUser.findOne({ slackUserId: event.user, workspaceId }).lean();
  const isThreadReply = !!(event.thread_ts && event.thread_ts !== event.ts);
  const parentTs = isThreadReply ? event.thread_ts : null;

  const doc = {
    slackTs: event.ts,
    channelId,
    workspaceId,
    orgId,
    senderSlackUserId: event.user || 'unknown',
    senderDisplayName: (senderCache as any)?.displayName || event.username || 'Unknown',
    senderAvatar: (senderCache as any)?.avatar || '',
    threadTs: event.thread_ts || null,
    isThreadReply,
    parentTs,
    text: event.text || '',
    blocks: event.blocks || [],
    reactions: [],
    files: (event.files || []).map((f: any) => ({
      slackFileId: f.id,
      name: f.name || 'file',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size || 0,
      permalink: f.permalink || '',
      previewUrl: f.thumb_360 || '',
      urlPrivate: f.url_private || '',
    })),
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
  };

  const saved = await SlackMessage.findOneAndUpdate(
    { channelId, slackTs: event.ts },
    { $set: doc },
    { upsert: true, new: true }
  );

  // Update thread reply count if this is a reply
  if (event.thread_ts && event.thread_ts !== event.ts) {
    await messagesService.updateParentThreadMetadata(orgId, channelId, event.thread_ts);
    const parentMsg = await SlackMessage.findOne({ channelId, slackTs: event.thread_ts }).lean();
    if (parentMsg) {
      broadcastToOrg(orgId, 'slack:thread_updated', {
        channelId,
        threadTs: event.thread_ts,
        replyCount: parentMsg.replyCount,
        thread: parentMsg.thread
      });
    }
  }

  // Update channel lastMessage
  if (!event.thread_ts || event.thread_ts === event.ts) {
    await SlackChannel.updateOne(
      { slackChannelId: channelId, orgId },
      { $set: { lastMessageTs: event.ts, lastMessageText: (event.text || '').slice(0, 120) } }
    );
  }

  broadcastToOrg(orgId, 'slack:new_message', saved?.toObject ? saved.toObject() : saved);
}

export async function onMessageChanged(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const msg = event.message;
  if (!msg) return;

  const updated = await SlackMessage.findOneAndUpdate(
    { channelId: event.channel, slackTs: msg.ts },
    { $set: { text: msg.text || '', isEdited: true, blocks: msg.blocks || [] } },
    { new: true }
  );

  if (updated) {
    broadcastToOrg(orgId, 'slack:message_edited', updated.toObject ? updated.toObject() : updated);
  }
}

export async function onMessageDeleted(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const msg = await SlackMessage.findOne({ channelId: event.channel, slackTs: event.deleted_ts }).lean() as any;

  await SlackMessage.updateOne(
    { channelId: event.channel, slackTs: event.deleted_ts },
    { $set: { isDeleted: true, text: '' } }
  );

  if (msg?.isThreadReply && msg?.parentTs) {
    await messagesService.updateParentThreadMetadata(orgId, event.channel, msg.parentTs);
    const parentMsg = await SlackMessage.findOne({ channelId: event.channel, slackTs: msg.parentTs }).lean();
    if (parentMsg) {
      broadcastToOrg(orgId, 'slack:thread_updated', {
        channelId: event.channel,
        threadTs: msg.parentTs,
        replyCount: parentMsg.replyCount,
        thread: parentMsg.thread
      });
    }
  }

  broadcastToOrg(orgId, 'slack:message_deleted', {
    channelId: event.channel,
    slackTs: event.deleted_ts,
    parentTs: msg?.parentTs || null,
    isThreadReply: !!msg?.isThreadReply,
  });
}

export async function onReactionAdded(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const { reaction: emoji, user: slackUserId, item } = event;
  if (!item || item.type !== 'message') return;

  const msg = await SlackMessage.findOne({ channelId: item.channel, slackTs: item.ts });
  if (!msg) return;

  const existing = msg.reactions.find((r) => r.emoji === emoji);
  if (existing) {
    if (!existing.userIds.includes(slackUserId)) {
      existing.userIds.push(slackUserId);
      existing.count = existing.userIds.length;
    }
  } else {
    msg.reactions.push({ emoji, count: 1, userIds: [slackUserId] });
  }
  msg.markModified('reactions');
  await msg.save();

  broadcastToOrg(orgId, 'slack:reaction_added', {
    channelId: item.channel,
    slackTs: item.ts,
    emoji,
    slackUserId,
    reactions: msg.reactions,
  });
}

export async function onReactionRemoved(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const { reaction: emoji, user: slackUserId, item } = event;
  if (!item || item.type !== 'message') return;

  const msg = await SlackMessage.findOne({ channelId: item.channel, slackTs: item.ts });
  if (!msg) return;

  const existing = msg.reactions.find((r) => r.emoji === emoji);
  if (existing) {
    existing.userIds = existing.userIds.filter((u) => u !== slackUserId);
    existing.count = existing.userIds.length;
    msg.reactions = msg.reactions.filter((r) => r.count > 0);
  }
  msg.markModified('reactions');
  await msg.save();

  broadcastToOrg(orgId, 'slack:reaction_removed', {
    channelId: item.channel,
    slackTs: item.ts,
    emoji,
    slackUserId,
    reactions: msg.reactions,
  });
}

export async function onFileShared(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;
  // File info will be embedded in the corresponding message event
  broadcastToOrg(orgId, 'slack:file_uploaded', { channelId: event.channel_id, fileId: event.file_id });
}

export async function onUserChange(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;
  const user = event.user;
  if (!user?.id) return;

  const profile = user.profile || {};
  await SlackUser.findOneAndUpdate(
    { slackUserId: user.id, workspaceId },
    {
      name: user.name,
      displayName: profile.display_name || user.name,
      realName: profile.real_name || '',
      avatar: profile.image_72 || profile.image_48 || '',
      isDeleted: user.deleted || false,
    },
    { upsert: false }
  );
}

export async function onPresenceChange(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;

  const presence = event.presence as 'active' | 'away';
  await SlackUser.updateOne({ slackUserId: event.user, workspaceId }, { $set: { presence } });

  broadcastToOrg(orgId, 'slack:presence_changed', {
    slackUserId: event.user,
    presence,
  });
}

export async function onChannelCreated(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;
  const ch = event.channel;
  if (!ch?.id) return;

  await SlackChannel.findOneAndUpdate(
    { slackChannelId: ch.id, workspaceId },
    {
      slackChannelId: ch.id,
      workspaceId,
      orgId,
      name: ch.name || ch.id,
      isPrivate: false,
      isArchived: false,
      isIm: false,
      isMpim: false,
    },
    { upsert: true, new: true }
  );

  broadcastToOrg(orgId, 'slack:channel_updated', { action: 'created', channelId: ch.id, name: ch.name });
}

export async function onChannelRenamed(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;
  const ch = event.channel;
  await SlackChannel.updateOne({ slackChannelId: ch.id || ch, workspaceId }, { $set: { name: ch.name } });
  broadcastToOrg(orgId, 'slack:channel_updated', { action: 'renamed', channelId: ch.id, name: ch.name });
}

export async function onChannelArchived(event: any, workspaceId: string) {
  const orgId = await getOrgId(workspaceId);
  if (!orgId) return;
  await SlackChannel.updateOne({ slackChannelId: event.channel, workspaceId }, { $set: { isArchived: true } });
  broadcastToOrg(orgId, 'slack:channel_updated', { action: 'archived', channelId: event.channel });
}

/**
 * Central dispatcher: route incoming Slack event payloads to the correct handler.
 */
export async function dispatchEvent(body: any) {
  const eventType: string = body.event?.type;
  const subtype: string = body.event?.subtype;
  const workspaceId: string = body.team_id;

  if (!eventType || !workspaceId) return;

  switch (eventType) {
    case 'message':
      if (!subtype || subtype === 'bot_message' || subtype === 'file_share') {
        await onMessageCreated(body.event, workspaceId);
      } else if (subtype === 'message_changed') {
        await onMessageChanged(body.event, workspaceId);
      } else if (subtype === 'message_deleted') {
        await onMessageDeleted(body.event, workspaceId);
      }
      break;
    case 'reaction_added':
      await onReactionAdded(body.event, workspaceId);
      break;
    case 'reaction_removed':
      await onReactionRemoved(body.event, workspaceId);
      break;
    case 'file_shared':
      await onFileShared(body.event, workspaceId);
      break;
    case 'user_change':
      await onUserChange(body.event, workspaceId);
      break;
    case 'presence_change':
      await onPresenceChange(body.event, workspaceId);
      break;
    case 'channel_created':
      await onChannelCreated(body.event, workspaceId);
      break;
    case 'channel_rename':
      await onChannelRenamed(body.event, workspaceId);
      break;
    case 'channel_archive':
      await onChannelArchived(body.event, workspaceId);
      break;
    default:
      break;
  }
}
