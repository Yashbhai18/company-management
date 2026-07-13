import { Request, Response } from 'express';
import * as oauthService from '../integrations/slack/oauth.service';
import * as channelsService from '../integrations/slack/channels.service';
import * as usersService from '../integrations/slack/users.service';
import * as messagesService from '../integrations/slack/messages.service';
import * as reactionsService from '../integrations/slack/reactions.service';
import * as filesService from '../integrations/slack/files.service';
import * as searchService from '../integrations/slack/search.service';
import * as syncService from '../integrations/slack/sync.service';
import * as eventsService from '../integrations/slack/events.service';
import { SlackChannel } from '../models/SlackChannel';
import { SlackUser } from '../models/SlackUser';
import { SlackMessage } from '../models/SlackMessage';
import { Project } from '../models/Project';
import type { TokenPayload } from '../utils/token';
import { CLIENT_URL } from '../config/env';
import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { DmScopeError } from '../integrations/slack/channels.service';

// ── OAuth ────────────────────────────────────────────────────────────────────

export const getOAuthUrl = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const url = oauthService.generateOAuthUrl(orgId);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;
    if (error || !code || !state) {
      return res.redirect(`${CLIENT_URL}/settings/slack?error=${error || 'missing_params'}`);
    }

    // Decode state
    let decodedState: any;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      return res.redirect(`${CLIENT_URL}/settings/slack?error=invalid_state`);
    }

    const orgId = decodedState.orgId;
    const isUserFlow = decodedState.type === 'user';

    if (isUserFlow) {
      await oauthService.exchangeUserCode(code, state);
      return res.redirect(`${CLIENT_URL}/profile?success=slack_user_connected`);
    }

    const { workspaceId, teamName } = await oauthService.exchangeCode(code, state, orgId);

    // Kick off background sync (don't await — redirect immediately)
    syncService.syncWorkspace(orgId).catch((err) =>
      console.error('[slack] Post-OAuth sync failed:', err.message)
    );

    res.redirect(`${CLIENT_URL}/settings/slack?success=1&workspace=${encodeURIComponent(teamName)}`);
  } catch (err: any) {
    console.error('[slack] OAuth callback error:', err);
    res.redirect(`${CLIENT_URL}/settings/slack?error=oauth_failed`);
  }
};

export const disconnectWorkspace = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    await oauthService.disconnectWorkspace(orgId);
    res.json({ message: 'Slack workspace disconnected' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── User OAuth ────────────────────────────────────────────────────────────────

export const getUserOAuthUrl = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const url = oauthService.generateUserOAuthUrl(orgId, userId);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const disconnectUserAccount = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user as TokenPayload;
    await oauthService.disconnectUserAccount(userId);
    res.json({ message: 'User Slack account disconnected' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getUserSlackStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).user as TokenPayload;
    const { User } = await import('../models/User');
    const user = await User.findById(userId).select('slack').lean();
    if (!user || !user.slack || !user.slack.connected) {
      return res.json({ connected: false });
    }

    // Retrieve Slack avatar details using user token
    let slackAvatar = '';
    try {
      const token = await oauthService.getUserAccessToken(userId);
      if (token) {
        const userClient = new WebClient(token);
        const userInfo = await userClient.users.info({ user: user.slack.slackUserId as string });
        if (userInfo.ok && userInfo.user) {
          slackAvatar = userInfo.user.profile?.image_192 || userInfo.user.profile?.image_72 || '';
        }
      }
    } catch (err) {
      console.warn('[slack:user:status] Failed to fetch Slack avatar:', err);
    }

    res.json({
      connected: true,
      teamName: user.slack.teamName,
      slackUserId: user.slack.slackUserId,
      slackDisplayName: user.slack.slackDisplayName,
      slackUsername: user.slack.slackUsername,
      slackAvatar,
      scopes: user.slack.scopes,
      connectedAt: user.slack.connectedAt
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Workspace ────────────────────────────────────────────────────────────────

export const getWorkspace = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const ws = await oauthService.getWorkspace(orgId);

    // Fetch user-level Slack mapping details
    const { User } = await import('../models/User');
    const userDoc = await User.findById(userId).select('slack').lean();
    const userConnected = !!(userDoc?.slack?.connected);
    const userSlackUserId = userDoc?.slack?.slackUserId || null;

    if (!ws) {
      return res.json({
        connected: false,
        userConnected,
        userSlackUserId
      });
    }

    res.json({
      connected: true,
      workspaceId: (ws as any).workspaceId,
      teamName: (ws as any).teamName,
      scope: (ws as any).scope,
      lastSyncedAt: (ws as any).lastSyncedAt,
      userConnected,
      userSlackUserId
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Channels ─────────────────────────────────────────────────────────────────

const formatChannelName = (name: string): string => {
  if (!name) return '';
  let cleanName = name.startsWith('#') ? name.slice(1) : name;
  cleanName = cleanName.replace(/-/g, ' ');
  return cleanName
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
};

export const getChannels = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    
    // Fetch active workspace to verify organization mapping
    const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
    
    console.log("GET /api/slack/channels request context:", {
      userId,
      orgId,
      workspaceId: ws?.workspaceId || 'none',
      teamName: ws?.teamName || 'none',
      hasBotToken: !!ws?.botTokenEncrypted
    });

    if (req.query.bypass === 'true') {
      console.log("Bypassing MongoDB and fetching channels directly from Slack API...");
      if (!ws) {
        throw new Error("No active Slack workspace found for this organization to bypass cache");
      }
      const client = new WebClient(ws.getBotToken());
      const result = await client.conversations.list({
        types: "public_channel,private_channel,im,mpim",
        exclude_archived: true,
        limit: 1000
      });
      console.log("Direct conversations.list API result count:", result.channels?.length || 0);
      return res.json(result.channels || []);
    }

    const { User } = await import('../models/User');
    const userDoc = await User.findById(userId).select('slack.slackUserId').lean() as any;
    const userSlackUserId = userDoc?.slack?.slackUserId || null;

    const dbChannels = await channelsService.getCachedChannels(orgId, {
      userSlackUserId,
      botUserId: ws?.botUserId || null
    });
    const dbUsers = await SlackUser.find({ orgId, isDeleted: false })
      .populate('localUserId', 'name')
      .lean() as any;

    const filteredDbChannels = dbChannels.filter((ch: any) => {
      // Filter out self-DMs
      if (ch.isIm && userSlackUserId && ch.dmUserSlackId === userSlackUserId) {
        return false;
      }
      return true;
    });

    const formattedChannels = filteredDbChannels.map((ch: any) => {
      const isIm = ch.isIm || ch.isMpim;
      let displayName = ch.name;
      let avatar = '';
      let presence = 'away';

      if (isIm) {
        const participant = dbUsers.find((u: any) => u.slackUserId === ch.dmUserSlackId);
        if (participant) {
          const platformName = participant.localUserId?.name;
          displayName = platformName || participant.displayName || participant.realName || participant.name || 'Direct Message';
          avatar = participant.avatar || '';
          presence = participant.presence || 'away';
        } else {
          displayName = 'Direct Message';
        }
      } else {
        displayName = formatChannelName(ch.name);
      }

      return {
        ...ch,
        id: ch.slackChannelId,
        conversationId: ch.slackChannelId,
        displayName,
        avatar,
        presence,
        memberCount: ch.memberCount || 0
      };
    });

    // Append missing users as "virtual" channels
    for (const u of dbUsers) {
      if (u.isBot && u.slackUserId !== 'USLACKBOT') continue;
      if (u.isAppUser) continue;
      if (u.slackUserId === userSlackUserId) continue; // no self DMs

      // Check if they already exist in formattedChannels
      const existing = formattedChannels.find((ch: any) => ch.isIm && ch.dmUserSlackId === u.slackUserId);
      if (!existing) {
        formattedChannels.push({
          _id: `virtual_${u.slackUserId}`,
          id: '',
          slackChannelId: '',
          conversationId: '',
          name: u.name,
          displayName: u.displayName || u.realName || u.name,
          avatar: u.avatar || '',
          presence: u.presence || 'away',
          isIm: true,
          isMpim: false,
          isPrivate: true,
          isGroup: false,
          isChannel: false,
          dmUserSlackId: u.slackUserId,
          unreadCount: 0,
          memberCount: 2
        });
      }
    }

    // Sort formattedChannels: Channels first (alphabetical), then DMs (alphabetical)
    formattedChannels.sort((a: any, b: any) => {
      if (a.isIm !== b.isIm) {
        return a.isIm ? 1 : -1;
      }
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

    console.log(`Fetched ${formattedChannels.length} merged channels/users for orgId: ${orgId}`);
    res.json(formattedChannels);
  } catch (err: any) {
    console.error("GET /api/slack/channels error:", err.message || err);
    res.status(500).json({ message: err.message });
  }
};

export const createChannel = async (req: Request, res: Response) => {
  try {
    const { orgId, role } = (req as any).user as TokenPayload;
    if (role === 'employee') return res.status(403).json({ message: 'Admins only' });
    const { name, isPrivate } = req.body;
    const channel = await channelsService.createChannel(orgId, name, isPrivate);
    res.status(201).json(channel);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateChannel = async (req: Request, res: Response) => {
  try {
    const { orgId, role } = (req as any).user as TokenPayload;
    if (role === 'employee') return res.status(403).json({ message: 'Admins only' });
    const { channelId, name, archive, linkedProjectId } = req.body;

    if (archive) await channelsService.archiveChannel(orgId, channelId);
    if (name) await channelsService.renameChannel(orgId, channelId, name);
    if (linkedProjectId !== undefined) {
      const ch = await SlackChannel.findOneAndUpdate(
        { slackChannelId: channelId, orgId },
        { $set: { linkedProjectId: linkedProjectId || null } },
        { new: true }
      );
      if (ch) {
        await Project.updateOne(
          { _id: linkedProjectId },
          {
            $set: {
              slackChannelId: channelId,
              slackChannelName: ch.name,
              slackWorkspaceId: ch.workspaceId,
              isSlackPrivate: ch.isPrivate,
            },
          }
        );
      }
    }

    res.json({ message: 'Channel updated' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Channel Members ───────────────────────────────────────────────────────────

export const getChannelMembers = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { channelId } = req.params;

    const ws = await oauthService.getWorkspace(orgId);
    if (!ws) throw new Error('No Slack workspace connected');
    
    // We should prefer the user token if available to see DMs they are in
    let token = ws.getUserToken() || ws.getBotToken();
    if (!token) throw new Error('No Slack token available');

    const { WebClient } = await import('@slack/web-api');
    const client = new WebClient(token);

    // Call Slack conversations.members
    const result = await client.conversations.members({ channel: channelId as string, limit: 200 });
    const memberIds = result.members || [];

    // Map these IDs to our local users
    const { SlackUser } = await import('../models/SlackUser');
    const dbUsers = await SlackUser.find({
      orgId,
      slackUserId: { $in: memberIds },
      isDeleted: false
    }).lean() as any[];

    const formattedMembers = dbUsers.map(u => ({
      slackUserId: u.slackUserId,
      name: u.name,
      displayName: u.displayName,
      realName: u.realName,
      email: u.email,
      avatar: u.avatar,
      isBot: u.isBot
    }));

    // Identify if any member IDs are missing from DB
    const foundIds = new Set(formattedMembers.map(u => u.slackUserId));
    const missingIds = memberIds.filter(id => !foundIds.has(id));

    if (missingIds.length > 0) {
      // Fallback: fetch missing users from Slack API directly
      console.log(`[slack:members] Fetching ${missingIds.length} missing users from users.info`);
      for (const missingId of missingIds) {
        try {
          const uInfo = await client.users.info({ user: missingId });
          if (uInfo.user && !uInfo.user.deleted) {
            const profile = uInfo.user.profile || {};
            formattedMembers.push({
              slackUserId: uInfo.user.id || missingId,
              name: uInfo.user.name || '',
              displayName: profile.display_name || profile.real_name || uInfo.user.name || '',
              realName: profile.real_name || '',
              email: profile.email || '',
              avatar: profile.image_512 || profile.image_192 || profile.image_72 || profile.image_48,
              isBot: !!uInfo.user.is_bot
            });
          }
        } catch (err: any) {
          console.warn(`[slack:members] Failed to fetch missing user ${missingId}:`, err.message);
        }
      }
    }

    res.json(formattedMembers);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const getUsers = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const dbUsers = await usersService.getCachedUsers(orgId);
    const formattedUsers = dbUsers.map((u: any) => ({
      ...u,
      id: u.slackUserId,
      displayName: u.displayName || u.realName || u.name || 'Workspace Member',
      avatar: u.avatar || '',
      presence: u.presence || 'away'
    }));
    res.json(formattedUsers);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const user = await usersService.getCachedUser(orgId, req.params.id as string);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      ...user,
      id: user.slackUserId,
      displayName: user.displayName || user.realName || user.name || 'Workspace Member',
      avatar: user.avatar || '',
      presence: user.presence || 'away'
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Messages ─────────────────────────────────────────────────────────────────

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const channelId = req.params.channelId as string;
    const { before, limit } = req.query as Record<string, string>;

    console.log(`GET /api/slack/messages/${channelId} called. before: ${before || 'none'}, limit: ${limit || 'default'}`);

    // Return cached messages first; if cache is empty fetch from Slack
    let messages = await messagesService.getCachedMessages(orgId, channelId, {
      before,
      limit: Number(limit) || 50,
    });

    if (!messages.length) {
      console.log(`Cache empty for channel ${channelId}, fetching history from Slack...`);
      messages = await messagesService.fetchHistory(orgId, channelId, {
        limit: Number(limit) || 50,
        latest: before,
      });
    }

    console.log(`Returning ${messages.length} messages for channel ${channelId}`);
    res.json(messages.reverse());
  } catch (err: any) {
    console.error(`Error in getMessages for channel ${req.params.channelId}:`, err.message || err);
    res.status(500).json({ message: err.message });
  }
};

export const postMessage = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { channelId, text, threadTs, blocks } = req.body;
    const decodedText = text ? text.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : text;
    const msg = await messagesService.postMessage(orgId, channelId, decodedText, {
      threadTs,
      blocks,
      senderUserId: userId
    });

    // Broadcast the message immediately via Socket.IO for real-time UI updates
    try {
      const { broadcastToOrg } = await import('../integrations/slack/events.service');
      broadcastToOrg(orgId, 'slack:new_message', msg.toObject ? msg.toObject() : msg);
    } catch (broadcastErr) {
      console.warn('[slack:broadcast] Failed to broadcast message:', broadcastErr);
    }

    res.status(201).json(msg);
  } catch (err: any) {
    // Slack errors that mean the user must re-authenticate
    const slackErr = err?.data?.error || err?.code;
    const isTokenError = ['token_revoked', 'invalid_auth', 'account_inactive', 'token_expired'].includes(slackErr);

    if (err instanceof DmScopeError || err.code === 'slack_reconnect_required' || isTokenError) {
      return res.status(403).json({
        error: 'slack_reconnect_required',
        message: isTokenError
          ? 'Your Slack token has been revoked or expired. Please reconnect Slack.'
          : err.message || 'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.',
      });
    }
    if (err.details) {
      return res.status(400).json(err.details);
    }
    res.status(500).json({ message: err.message });
  }
};

export const editMessage = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { channelId, ts, text } = req.body;
    const decodedText = text ? text.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : text;
    await messagesService.editMessage(orgId, channelId, ts, decodedText);
    res.json({ message: 'Message edited' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { channelId, ts } = req.body;
    await messagesService.deleteMessage(orgId, channelId, ts);
    res.json({ message: 'Message deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Threads ───────────────────────────────────────────────────────────────────

export const getThread = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const channelId = req.params.channelId as string;
    const threadTs = req.params.threadTs as string;
    const messages = await messagesService.fetchThread(orgId, channelId, threadTs);

    const parent = messages.find(m => m.slackTs === threadTs) || messages[0] || null;
    const replies = messages.filter(m => m.slackTs !== threadTs && m.isThreadReply === true);

    res.json({
      parent,
      replies
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const postThreadReply = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { channelId, threadTs, text } = req.body;
    const decodedText = text ? text.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : text;
    const msg = await messagesService.postMessage(orgId, channelId, decodedText, {
      threadTs,
      senderUserId: userId
    });

    // Broadcast the thread reply via Socket.IO immediately
    try {
      const { broadcastToOrg } = await import('../integrations/slack/events.service');
      broadcastToOrg(orgId, 'slack:new_message', msg.toObject ? msg.toObject() : msg);
      
      const count = await SlackMessage.countDocuments({ channelId, threadTs });
      await SlackMessage.updateOne({ channelId, slackTs: threadTs }, { $set: { replyCount: count } });
      broadcastToOrg(orgId, 'slack:thread_updated', { channelId, threadTs, replyCount: count });
    } catch (broadcastErr) {
      console.warn('[slack:broadcast] Failed to broadcast thread reply:', broadcastErr);
    }

    res.status(201).json(msg);
  } catch (err: any) {
    if (err.details) {
      return res.status(400).json(err.details);
    }
    res.status(500).json({ message: err.message });
  }
};

// ── Files ─────────────────────────────────────────────────────────────────────

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.body) {
      return res.status(400).json({ message: 'Missing request body' });
    }

    const { channelId, threadTs, text } = req.body;
    
    if (!channelId) {
      return res.status(400).json({ message: 'channelId is required' });
    }

    const reqFiles = (req as any).files as any[];
    if (!reqFiles || reqFiles.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const { orgId, userId } = (req as any).user as TokenPayload;

    const fileData = reqFiles.map(file => ({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype
    }));

    const result = await filesService.uploadFiles(
      orgId,
      channelId,
      fileData,
      text,
      userId,
      threadTs
    );
    
    // Broadcast the message immediately via Socket.IO for real-time UI updates
    try {
      const payload = result.toObject ? result.toObject() : result;
      console.log(`[slack:upload:audit] Emitting slack:new_message to org ${orgId}`);
      console.log(`[slack:upload:audit] Payload:`, JSON.stringify(payload, null, 2));
      const { broadcastToOrg } = await import('../integrations/slack/events.service');
      broadcastToOrg(orgId, 'slack:new_message', payload);
      console.log(`[slack:upload:audit] Successfully emitted event.`);
    } catch (broadcastErr) {
      console.warn('[slack:broadcast] Failed to broadcast message:', broadcastErr);
    }

    res.status(201).json(result);
  } catch (err: any) {
    console.error('[slack:upload] Error uploading file:', err);
    if (err.message && err.message.includes('missing_scope')) {
      return res.status(403).json({
        error: 'slack_reconnect_required',
        message: 'File uploads require additional permissions. Please reconnect your Slack account to enable file sharing.'
      });
    }
    res.status(500).json({ message: err.message });
  }
};

// ── Unified Slack File Proxy ──────────────────────────────────────────────────
// Always fetches a fresh url_private_download via files.info — never trusts stored URLs.

async function resolveSlackToken(orgId: string, userId: string): Promise<{ token: string; tokenType: 'user' | 'bot' }> {
  const { getUserAccessToken } = await import('../integrations/slack/oauth.service');

  // 1. Try the requesting user's OAuth token (handles token refresh automatically)
  if (userId) {
    const userToken = await getUserAccessToken(userId);
    if (userToken) {
      return { token: userToken, tokenType: 'user' };
    }
  }

  // 2. Fall back to workspace bot token
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  const botToken = ws?.getBotToken();
  if (botToken) {
    return { token: botToken, tokenType: 'bot' };
  }

  throw new Error('No valid Slack token found for this organization');
}

async function fetchSlackFileInfo(fileId: string, token: string, tokenType: string): Promise<{ downloadUrl: string; thumbUrl: string; contentType: string; fileName: string }> {
  console.log(`[slack:proxy] files.info → fileId=${fileId} tokenType=${tokenType}`);

  const infoRes = await fetch(`https://slack.com/api/files.info?file=${fileId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const infoData: any = await infoRes.json();
  console.log(`[slack:proxy] files.info response → ok=${infoData.ok} error=${infoData.error || 'none'}`);

  if (!infoData.ok) {
    if (['invalid_auth', 'not_authed', 'account_inactive'].includes(infoData.error)) {
      console.error(`[slack:proxy] Auth error from files.info (${infoData.error}):`, JSON.stringify(infoData));
    }
    throw Object.assign(new Error(`Slack files.info error: ${infoData.error}`), {
      slackError: infoData.error,
      statusCode: infoData.error === 'file_not_found' ? 404 : 502
    });
  }

  const file = infoData.file;
  const downloadUrl = file?.url_private_download || file?.url_private;
  if (!downloadUrl) {
    console.error(`[slack:proxy] No download URL in files.info response:`, JSON.stringify(file));
    throw Object.assign(new Error('File has no downloadable URL'), { statusCode: 404 });
  }
  
  const thumbUrl = file?.thumb_1024 || file?.thumb_720 || file?.thumb_480 || file?.thumb_360 || file?.thumb_160 || file?.thumb_80 || file?.thumb_64 || downloadUrl;

  console.log(`[slack:proxy] downloadUrl=${downloadUrl}, thumbUrl=${thumbUrl}`);
  return {
    downloadUrl,
    thumbUrl,
    contentType: file.mimetype || 'application/octet-stream',
    fileName: file.name || file.title || fileId
  };
}

async function streamSlackFile(
  downloadUrl: string,
  token: string,
  tokenType: string,
  fileId: string
): Promise<{ buffer: Buffer; contentType: string }> {
  console.log(`[slack:proxy] Fetching file content tokenType=${tokenType}`);

  const proxyRes = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(`[slack:proxy] Slack download HTTP status=${proxyRes.status} fileId=${fileId}`);

  if (!proxyRes.ok) {
    const body = await proxyRes.text().catch(() => '');
    console.error(`[slack:proxy] Slack download failed status=${proxyRes.status} body=${body}`);
    throw Object.assign(
      new Error(`Slack returned ${proxyRes.status} when downloading file`),
      { statusCode: proxyRes.status === 401 || proxyRes.status === 403 ? proxyRes.status : 502 }
    );
  }

  const arrayBuffer = await proxyRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = proxyRes.headers.get('content-type') || 'application/octet-stream';
  console.log(`[slack:proxy] Downloaded ${buffer.length} bytes contentType=${contentType}`);
  return { buffer, contentType };
}

export const getFileContent = async (req: Request, res: Response) => {
  try {
    const fileId = req.params.fileId;
    const isDownload = req.query.download === '1';
    const isThumb = req.query.thumb === '1';

    console.log(`[slack:proxy] getFileContent → fileId=${fileId} download=${isDownload} thumb=${isThumb}`);

    if (!fileId) {
      return res.status(400).json({ message: 'File ID is required' });
    }

    const { orgId, userId } = (req as any).user as TokenPayload;
    const fileIdStr = String(fileId);
    const userIdStr = String(userId || '');

    // Resolve token (user first, bot fallback)
    let tokenInfo: { token: string; tokenType: string };
    try {
      tokenInfo = await resolveSlackToken(orgId, userIdStr);
      console.log(`[slack:proxy] Using ${tokenInfo.tokenType} token for fileId=${fileIdStr}`);
    } catch (e: any) {
      return res.status(403).json({ message: e.message });
    }

    // Get fresh download URL from Slack
    // eslint-disable-next-line prefer-const
    let fileInfo!: { downloadUrl: string; thumbUrl: string; contentType: string; fileName: string };
    try {
      fileInfo = await fetchSlackFileInfo(fileIdStr, tokenInfo.token, tokenInfo.tokenType);
    } catch (e: any) {
      // If bot token fails auth, retry with user token specifically
      if (tokenInfo.tokenType === 'bot' && e.slackError && ['invalid_auth', 'not_authed', 'file_not_found'].includes(e.slackError)) {
        console.log(`[slack:proxy] Bot token failed (${e.slackError}), retrying with user token`);
        const { getUserAccessToken } = await import('../integrations/slack/oauth.service');
        const userToken = await getUserAccessToken(userIdStr);
        if (userToken) {
          try {
            fileInfo = await fetchSlackFileInfo(fileIdStr, userToken, 'user');
            tokenInfo = { token: userToken, tokenType: 'user' };
          } catch (e2: any) {
            return res.status(e2.statusCode || 502).json({ message: e2.message, slackError: e2.slackError });
          }
        } else {
          return res.status(e.statusCode || 502).json({ message: e.message, slackError: e.slackError });
        }
      } else {
        return res.status(e.statusCode || 502).json({ message: e.message, slackError: e.slackError });
      }
    }

    // Stream the file
    // eslint-disable-next-line prefer-const
    let streamResult!: { buffer: Buffer; contentType: string };
    try {
      const targetUrl = isThumb ? fileInfo.thumbUrl : fileInfo.downloadUrl;
      streamResult = await streamSlackFile(targetUrl, tokenInfo.token, tokenInfo.tokenType, fileIdStr);
    } catch (e: any) {
      // If download fails with auth error, retry with opposite token type
      if ([401, 403].includes(e.statusCode) && tokenInfo.tokenType === 'bot') {
        console.log(`[slack:proxy] Bot token rejected for download, retrying with user token`);
        const { getUserAccessToken } = await import('../integrations/slack/oauth.service');
        const userToken = await getUserAccessToken(userIdStr);
        if (userToken) {
          streamResult = await streamSlackFile(fileInfo.downloadUrl, userToken, 'user', fileIdStr);
        } else {
          return res.status(e.statusCode).json({ message: e.message });
        }
      } else {
        return res.status(e.statusCode || 502).json({ message: e.message });
      }
    }

    res.setHeader('Content-Type', streamResult.contentType);
    res.setHeader('Content-Length', streamResult.buffer.length);
    res.setHeader('Cache-Control', 'private, no-store'); // Private files should not be publicly cached

    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
    }

    return res.send(streamResult.buffer);
  } catch (err: any) {
    console.error(`[slack:proxy] Unexpected error in getFileContent:`, err);
    res.status(500).json({ message: err.message });
  }
};

export const getThumbnail = async (req: Request, res: Response) => {
  // Pass thumb=1 internally so getFileContent uses thumbUrl
  req.query.thumb = '1';
  return getFileContent(req, res);
};

// Legacy proxy endpoint — kept for backward compat but now also goes through files.info
export const proxyFile = async (req: Request, res: Response) => {
  // Redirect to getFileContent if we have a fileId query param
  const fileId = req.query.fileId as string;
  if (fileId) {
    req.params = { ...req.params, fileId };
    return getFileContent(req, res);
  }

  // If only a raw URL is provided (old path), reject it with a clear message
  const url = req.query.url as string;
  if (url) {
    console.warn(`[slack:proxy] proxyFile called with raw url= (deprecated, stale URL risk). url=${url}`);
    return res.status(400).json({
      message: 'Direct URL proxying is no longer supported. Use /api/slack/files/:fileId instead.',
    });
  }

  return res.status(400).json({ message: 'fileId or url query param required' });
};



export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const fileId = req.params.fileId as string;
    await filesService.deleteFile(orgId, fileId, userId);
    res.json({ message: 'File deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Search ────────────────────────────────────────────────────────────────────

export const search = async (req: Request, res: Response) => {
  try {
    const { orgId } = (req as any).user as TokenPayload;
    const { q } = req.query as { q?: string };
    if (!q?.trim()) return res.json({ messages: [], total: 0 });
    const results = await searchService.searchMessages(orgId, q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── Slack Events Webhook ──────────────────────────────────────────────────────

export const handleSlackEvent = async (req: Request, res: Response) => {
  const body = req.body;

  // Slack URL verification challenge
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  if (body.type === 'event_callback') {
    // Respond immediately to avoid Slack timeout (3s limit)
    res.status(200).send();
    // Process asynchronously
    eventsService.dispatchEvent(body).catch((err) =>
      console.error('[slack:events] Dispatch error:', err.message)
    );
    return;
  }

  res.status(200).send();
};

// ── Sync Trigger ──────────────────────────────────────────────────────────────

export const triggerSync = async (req: Request, res: Response) => {
  try {
    const { orgId, role } = (req as any).user as TokenPayload;
    if (role === 'employee') return res.status(403).json({ message: 'Admins only' });
    // Fire and forget
    syncService.syncWorkspace(orgId).catch(console.error);
    res.json({ message: 'Sync started' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const openDMConversation = async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = (req as any).user as TokenPayload;
    const { recipientSlackUserId } = req.body;

    if (!recipientSlackUserId) {
      return res.status(400).json({ message: 'recipientSlackUserId is required' });
    }

    const dmChannel = await channelsService.openDMConversation(orgId, recipientSlackUserId, userId);
    
    // Fetch recipient user details to match getChannels payload format
    const recipientInfo = await SlackUser.findOne({ slackUserId: recipientSlackUserId }).lean() as any;

    res.json({
      ...dmChannel.toObject ? dmChannel.toObject() : dmChannel,
      id: dmChannel.slackChannelId,
      conversationId: dmChannel.slackChannelId,
      displayName: recipientInfo?.displayName || recipientInfo?.realName || recipientInfo?.name || 'Direct Message',
      avatar: recipientInfo?.avatar || '',
      presence: recipientInfo?.presence || 'away',
      memberCount: dmChannel.memberCount || 2
    });
  } catch (err: any) {
    if (err instanceof DmScopeError || err.code === 'slack_reconnect_required') {
      return res.status(403).json({
        error: 'slack_reconnect_required',
        message: err.message || 'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.',
      });
    }
    console.error('[slack:dm:open] Error opening DM:', err);
    res.status(500).json({ message: err.message });
  }
};
