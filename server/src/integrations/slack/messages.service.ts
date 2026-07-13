import { WebClient } from '@slack/web-api';
import mongoose from 'mongoose';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackMessage, ISlackMessage } from '../../models/SlackMessage';
import { SlackUser } from '../../models/SlackUser';
import { SlackChannel } from '../../models/SlackChannel';
import { DmScopeError } from './channels.service';

async function getClient(orgId: string): Promise<{ client: WebClient; ws: typeof SlackWorkspace.prototype }> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace for this organization');
  return { client: new WebClient(ws.getBotToken()), ws };
}

async function getClientForUser(
  orgId: string,
  senderUserId?: string,
  opts: { isDmContext?: boolean } = {}
): Promise<{ client: WebClient; ws: any; isUserToken: boolean }> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace for this organization');

  if (senderUserId) {
    const { User } = await import('../../models/User');
    const user = await User.findById(senderUserId).select('slack').lean();
    if (!user || !user.slack || !user.slack.connected) {
      if (opts.isDmContext) {
        throw new DmScopeError(
          'Your Slack account is not connected. Please connect Slack to send Direct Messages.'
        );
      }
      class ForbiddenError extends Error {
        status = 403;
        constructor(message: string) {
          super(message);
          this.name = 'ForbiddenError';
        }
      }
      throw new ForbiddenError("Slack account connection required.");
    }

    const { getUserAccessToken } = await import('./oauth.service');
    const token = await getUserAccessToken(senderUserId);
    if (token) {
      const scopes = user.slack.scopes || '';
      const activeScopes = scopes.split(',').map((s: string) => s.trim());
      const hasImWrite = activeScopes.includes('im:write');

      if (opts.isDmContext && !hasImWrite) {
        throw new DmScopeError(
          'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.'
        );
      }

      if (!opts.isDmContext && !hasImWrite) {
        console.warn(`[slack:auth] User token for user ${senderUserId} is missing 'im:write'. Falling back to Bot Token (non-DM context).`);
        return { client: new WebClient(ws.getBotToken()), ws, isUserToken: false };
      }

      console.log(`[slack:message] Using User OAuth Token for user ${senderUserId}`);
      return { client: new WebClient(token), ws, isUserToken: true };
    }

    if (opts.isDmContext) {
      throw new DmScopeError(
        'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.'
      );
    }

    class ForbiddenError extends Error {
      status = 403;
      constructor(message: string) {
        super(message);
        this.name = 'ForbiddenError';
      }
    }
    throw new ForbiddenError("Slack account connection required.");
  }

  if (opts.isDmContext) {
    throw new DmScopeError(
      'Cannot open a Direct Message without an authenticated user. Please reconnect Slack.'
    );
  }

  console.log(`[slack:message] Using Workspace Bot Token`);
  return { client: new WebClient(ws.getBotToken()), ws, isUserToken: false };
}

/** Map a raw Slack message to our SlackMessage schema fields */
async function mapMessage(raw: any, channelId: string, workspaceId: string, orgId: any) {
  // Resolve sender info from cache
  const senderCache = await SlackUser.findOne({ slackUserId: raw.user || raw.bot_id, workspaceId }).lean();
  let senderDisplayName = (senderCache as any)?.displayName || raw.username || 'Unknown';
  let senderAvatar = (senderCache as any)?.avatar || '';

  if (senderDisplayName === 'Unknown' && (raw.user || raw.bot_id)) {
    const { User } = await import('../../models/User');
    const dbUser = await User.findOne({ 'slack.slackUserId': raw.user || raw.bot_id }).select('name avatar').lean();
    if (dbUser) {
      senderDisplayName = dbUser.name;
      senderAvatar = dbUser.avatar || '';
    }
  }

  const isThreadReply = !!(raw.thread_ts && raw.thread_ts !== raw.ts);
  const parentTs = isThreadReply ? raw.thread_ts : null;

  return {
    slackTs: raw.ts,
    channelId,
    workspaceId,
    orgId,
    senderSlackUserId: raw.user || raw.bot_id || 'unknown',
    senderDisplayName,
    senderAvatar,
    threadTs: raw.thread_ts || null,
    isThreadReply,
    parentTs,
    text: raw.text || '',
    blocks: raw.blocks || [],
    reactions: (raw.reactions || []).map((r: any) => ({
      emoji: r.name,
      count: r.count,
      userIds: r.users || [],
    })),
    files: (raw.files || []).map((f: any) => ({
      slackFileId: f.id,
      name: f.name || f.title || 'file',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size || 0,
      permalink: f.permalink || '',
      previewUrl: f.thumb_360 || f.thumb_80 || '',
      // url_private intentionally NOT stored — always re-fetch fresh via files.info
    })),
    replyCount: raw.reply_count || 0,
    isEdited: !!(raw.edited),
    isDeleted: false,
    subtype: raw.subtype || undefined,
  };
}

/**
 * Fetch and cache channel history.
 * Returns messages in ascending order (oldest first).
 */
export async function fetchHistory(
  orgId: string,
  slackChannelId: string,
  opts: { oldest?: string; latest?: string; limit?: number; inclusive?: boolean } = {}
): Promise<ISlackMessage[]> {
  const { client, ws } = await getClient(orgId);
  const limit = opts.limit || 50;

  const res = await client.conversations.history({
    channel: slackChannelId,
    oldest: opts.oldest,
    latest: opts.latest,
    inclusive: opts.inclusive,
    limit,
  });

  if (!res.ok || !res.messages) return [];

  const upsertOps = await Promise.all(
    (res.messages as any[]).map(async (raw) => {
      const doc = await mapMessage(raw, slackChannelId, ws.workspaceId, orgId);
      return {
        updateOne: {
          filter: { channelId: slackChannelId, slackTs: raw.ts },
          update: { $set: doc },
          upsert: true,
        },
      };
    })
  );

  if (upsertOps.length) await SlackMessage.bulkWrite(upsertOps as any);

  // Synchronize replies for any thread root messages found in this history page
  for (const raw of res.messages as any[]) {
    if (raw.thread_ts && raw.reply_count && raw.reply_count > 0) {
      try {
        console.log(`[slack:history] Syncing replies for thread ${raw.thread_ts} in channel ${slackChannelId}...`);
        await fetchThread(orgId, slackChannelId, raw.thread_ts);
      } catch (err: any) {
        console.warn(`[slack:history] Failed to sync replies for thread ${raw.thread_ts}:`, err.message);
      }
    }
  }

  // Update channel's last message info
  const newestMsg = (res.messages as any[])[0];
  if (newestMsg) {
    await SlackChannel.updateOne(
      { slackChannelId, orgId },
      { $set: { lastMessageTs: newestMsg.ts, lastMessageText: (newestMsg.text || '').slice(0, 120) } }
    );
  }

  return SlackMessage.find({ channelId: slackChannelId, orgId, isThreadReply: { $ne: true } })
    .sort({ slackTs: -1 })
    .limit(limit)
    .lean() as any;
}

/**
 * Fetch thread replies for a root message.
 */
export async function fetchThread(
  orgId: string,
  slackChannelId: string,
  threadTs: string
): Promise<ISlackMessage[]> {
  const { client, ws } = await getClient(orgId);
  const res = await client.conversations.replies({ channel: slackChannelId, ts: threadTs });

  if (!res.ok || !res.messages) return [];

  const upsertOps = await Promise.all(
    (res.messages as any[]).map(async (raw) => {
      const doc = await mapMessage(raw, slackChannelId, ws.workspaceId, orgId);
      return {
        updateOne: {
          filter: { channelId: slackChannelId, slackTs: raw.ts },
          update: { $set: doc },
          upsert: true,
        },
      };
    })
  );

  if (upsertOps.length) await SlackMessage.bulkWrite(upsertOps as any);

  await updateParentThreadMetadata(orgId, slackChannelId, threadTs);

  return SlackMessage.find({ channelId: slackChannelId, threadTs })
    .sort({ slackTs: 1 })
    .lean() as any;
}

/**
 * Post a new message to a Slack channel.
 * Returns the created SlackMessage doc.
 */
export async function postMessage(
  orgId: string,
  slackChannelId: string,
  text: string,
  opts: { threadTs?: string; blocks?: any[]; senderUserId?: string } = {}
): Promise<ISlackMessage> {
  console.log(`[slack:message] postMessage called. orgId: ${orgId}, channelId: ${slackChannelId}, text: "${text}", senderUserId: ${opts.senderUserId}`);
  
  let isDM = slackChannelId.startsWith('D') || slackChannelId.startsWith('U');
  const { client, ws, isUserToken } = await getClientForUser(orgId, opts.senderUserId, { isDmContext: isDM });

  let targetChannelId = slackChannelId;

  // Resolve U... (raw Slack user ID) to a D... DM channel.
  // D... channels are already canonical — do NOT re-open them here, that is done by the
  // openDMConversation controller before this function is ever called.
  if (slackChannelId.startsWith('U')) {
    console.log(`[slack:message] Detected recipient user ID ${slackChannelId}. Resolving to DM channel ID...`);
    const { openDMConversation } = await import('./channels.service');
    const dmChannel = await openDMConversation(orgId, slackChannelId, opts.senderUserId);
    targetChannelId = dmChannel.slackChannelId;
    console.log(`[slack:message] Resolved recipient user ID ${slackChannelId} to DM channel ID: ${targetChannelId}`);
  } else if (slackChannelId.startsWith('D')) {
    // Trust the D... channel id as-is. Log for audit.
    console.log(`[slack:message] DM channel ID received: ${slackChannelId}. Using as-is (canonical).`);
  }

  // Validate that a DM ends up as D...
  isDM = targetChannelId.startsWith('D') || slackChannelId.startsWith('U');
  if (isDM && !targetChannelId.startsWith('D')) {
    throw new Error(`Invalid DM channel ID format: ${targetChannelId}. Must start with D.`);
  }

  let finalText = text;

  // 2. Try to join channel first (only if using bot token, required for public channels, skip for DMs)
  if (!isUserToken && !targetChannelId.startsWith('D')) {
    try {
      console.log(`[slack:message] Attempting to auto-join channel ${targetChannelId}...`);
      const joinRes = await client.conversations.join({ channel: targetChannelId });
      console.log(`[slack:message] Join channel response:`, joinRes.ok ? "Success" : "Failed");
    } catch (joinErr: any) {
      // Non-blocking: fail silently for DMs/private channels
      console.log(`[slack:message] Auto-join skipped/failed for channel ${targetChannelId}: ${joinErr.message}`);
    }
  }

  // 3. Resolve recipient details for logs
  let recipientSlackUserId = null;
  let recipientDisplayName = 'Unknown';
  if (targetChannelId.startsWith('D')) {
    const chInfo = await SlackChannel.findOne({ slackChannelId: targetChannelId, orgId }).lean() as any;
    recipientSlackUserId = chInfo?.dmUserSlackId || (slackChannelId.startsWith('U') ? slackChannelId : null);
    if (recipientSlackUserId) {
      const uInfo = await SlackUser.findOne({ slackUserId: recipientSlackUserId, workspaceId: ws.workspaceId }).lean() as any;
      recipientDisplayName = uInfo?.displayName || uInfo?.realName || uInfo?.name || 'Unknown';
    }
  }

  // 4. Verify auth details as requested in Step 4
  let authTest: any = {};
  try {
    authTest = await client.auth.test();
  } catch (authErr: any) {
    console.warn(`[slack:message] auth.test() failed:`, authErr.message || authErr);
  }
  const tokenOwner = authTest.user || authTest.bot_id || 'unknown';

  // 5. Verify required scopes exist as requested in Step 6
  const requiredScopes = ['users:read', 'im:read', 'im:write', 'chat:write', 'im:history', 'channels:read', 'groups:read', 'mpim:read'];
  let activeScopesStr = '';
  if (isUserToken && opts.senderUserId) {
    const { User } = await import('../../models/User');
    activeScopesStr = (await User.findById(opts.senderUserId).select('slack.scopes').lean() as any)?.slack?.scopes || '';
  } else {
    activeScopesStr = ws.scope || '';
  }
  const activeScopes = activeScopesStr.split(',').map((s: string) => s.trim());
  const missingScopes = requiredScopes.filter(s => !activeScopes.includes(s));
  if (missingScopes.length > 0) {
    console.warn(`[slack:message] WARNING: Missing required Slack scopes:`, missingScopes);
  } else {
    console.log(`[slack:message] All required Slack scopes are present.`);
  }

  // Step 5: Call conversations.info and log details
  if (targetChannelId.startsWith('D')) {
    try {
      console.log(`[slack:message] Calling conversations.info for DM channel ${targetChannelId}...`);
      const infoRes = await client.conversations.info({ channel: targetChannelId });
      console.log(`[slack:message] conversations.info() response in full:`, JSON.stringify(infoRes, null, 2));
      if (infoRes.ok && infoRes.channel) {
        console.log(`[slack:message] Verified DM Conversation Info:`, {
          conversationId: infoRes.channel.id,
          is_im: !!(infoRes.channel as any).is_im,
          is_open: !!(infoRes.channel as any).is_open,
          is_member: !!(infoRes.channel as any).is_member,
          user: (infoRes.channel as any).user || null,
          team: (infoRes.channel as any).shared_team_ids || (infoRes.channel as any).context_team_id || null
        });
      }
    } catch (infoErr: any) {
      console.error(`[slack:message] conversations.info() call failed for channel ${targetChannelId}:`, infoErr.message || infoErr);
    }
  }

  // Step 2 Log: Pre-send Audit Log
  console.log(`[slack:message] BEFORE calling chat.postMessage:`, {
    recipientSlackUserId,
    dmChannelId: targetChannelId.startsWith('D') ? targetChannelId : null,
    workspaceId: ws.workspaceId,
    tokenType: isUserToken ? 'User OAuth Token (xoxp-...)' : 'Bot Token (xoxb-...)',
    tokenOwner,
    conversationType: targetChannelId.startsWith('D') ? 'IM (Direct Message)' : 'Channel',
    messageText: finalText
  });

  try {
    let res = await client.chat.postMessage({
      channel: targetChannelId,
      text: finalText,
      thread_ts: opts.threadTs,
      blocks: opts.blocks,
    }).catch(async (firstErr: any) => {
      // If we got not_in_channel, it means the user token isn't in the channel yet.
      // Auto-join and retry.
      if (firstErr.data?.error === 'not_in_channel' && targetChannelId.startsWith('C')) {
        console.log(`[slack:message] Received not_in_channel for User Token. Attempting auto-join for channel ${targetChannelId}...`);
        try {
          await client.conversations.join({ channel: targetChannelId });
          console.log(`[slack:message] Successfully auto-joined channel ${targetChannelId}. Retrying postMessage...`);
          // Retry the postMessage
          return await client.chat.postMessage({
            channel: targetChannelId,
            text: finalText,
            thread_ts: opts.threadTs,
            blocks: opts.blocks,
          });
        } catch (joinErr: any) {
          console.error(`[slack:message] Auto-join failed:`, joinErr.message || joinErr);
          throw firstErr; // Throw original error if join fails
        }
      }
      throw firstErr;
    });

    // Step 3 Log: Log the COMPLETE response from Slack
    console.log(`[slack:message] Slack chat.postMessage response in full:`, JSON.stringify(res, null, 2));

    if (!res.ok || !res.ts) {
      throw new Error(`Slack API returned ok=false: ${(res as any).error || 'unknown error'}`);
    }

    console.log(`[slack:message] Message posted successfully to Slack. ts: ${res.ts}, isUserToken: ${isUserToken}`);

    // Step 8: Call conversations.history() to verify delivery
    try {
      console.log(`[slack:message] Calling conversations.history for channel ${targetChannelId} to verify delivery...`);
      const historyRes = await client.conversations.history({
        channel: targetChannelId,
        limit: 10
      });
      console.log(`[slack:message] conversations.history() response count:`, historyRes.messages?.length || 0);
      const found = historyRes.messages?.find((m: any) => m.ts === res.ts);
      if (found) {
        console.log(`[slack:message] VERIFIED: Message successfully exists in Slack conversations.history. Text: "${found.text}"`);
      } else {
        console.warn(`[slack:message] WARNING: Message ts ${res.ts} not found in conversations.history output!`);
      }
    } catch (histErr: any) {
      console.error(`[slack:message] conversations.history() call failed for verification:`, histErr.message || histErr);
    }

    const raw = {
      ts: res.ts,
      text: finalText,
      thread_ts: opts.threadTs,
      blocks: opts.blocks,
      user: res.message?.user || res.message?.bot_id || ws.botUserId || 'unknown'
    };
    const doc = await mapMessage(raw, targetChannelId, ws.workspaceId, orgId);

    // Override display name & avatar in DB cache for sender info
    if (opts.senderUserId) {
      const { User } = await import('../../models/User');
      const sender = await User.findById(opts.senderUserId).select('name avatar').lean();
      if (sender) {
        doc.senderDisplayName = (sender as any).name;
        if ((sender as any).avatar) {
          doc.senderAvatar = (sender as any).avatar;
        }
      }
    }

    const savedMsg = await SlackMessage.findOneAndUpdate(
      { channelId: targetChannelId, slackTs: res.ts },
      { $set: doc },
      { upsert: true, new: true }
    ) as any;

    if (opts.threadTs) {
      await updateParentThreadMetadata(orgId, targetChannelId, opts.threadTs);
    }

    return savedMsg;
  } catch (postErr: any) {
    console.error(`[slack:message] Failed to post message to Slack channel ${targetChannelId}:`, postErr);
    
    // Step 7: Better Error Reporting details mapping
    const errorDetails = {
      operation: 'sendMessage',
      slackMethod: 'chat.postMessage',
      channelPassed: slackChannelId,
      recipientSlackUserId,
      dmChannelId: targetChannelId.startsWith('D') ? targetChannelId : null,
      workspaceId: ws.workspaceId,
      tokenType: isUserToken ? 'User OAuth Token (xoxp-...)' : 'Bot Token (xoxb-...)',
      slackError: postErr.message || postErr.code || 'unknown_error',
      stack: postErr.stack
    };
    
    (postErr as any).details = errorDetails;
    throw postErr;
  }
}

/** Edit an existing Slack message */
export async function editMessage(
  orgId: string,
  slackChannelId: string,
  ts: string,
  text: string
): Promise<void> {
  const { client } = await getClient(orgId);
  const res = await client.chat.update({ channel: slackChannelId, ts, text });
  if (!res.ok) throw new Error('Failed to edit Slack message');

  await SlackMessage.updateOne(
    { channelId: slackChannelId, slackTs: ts },
    { $set: { text, isEdited: true } }
  );
}

/** Delete a Slack message */
export async function deleteMessage(
  orgId: string,
  slackChannelId: string,
  ts: string
): Promise<void> {
  const { client } = await getClient(orgId);
  const res = await client.chat.delete({ channel: slackChannelId, ts });
  if (!res.ok) throw new Error('Failed to delete Slack message');

  const msg = await SlackMessage.findOne({ channelId: slackChannelId, slackTs: ts }).lean() as any;

  await SlackMessage.updateOne(
    { channelId: slackChannelId, slackTs: ts },
    { $set: { isDeleted: true, text: '' } }
  );

  if (msg?.isThreadReply && msg?.parentTs) {
    await updateParentThreadMetadata(orgId, slackChannelId, msg.parentTs);
  }
}

/** Get cached messages for a channel (without hitting Slack API) */
export async function getCachedMessages(
  orgId: string,
  channelId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<ISlackMessage[]> {
  const query: any = { channelId, orgId, isThreadReply: { $ne: true }, isDeleted: false };
  if (opts.before) query.slackTs = { $lt: opts.before };

  return SlackMessage.find(query)
    .sort({ slackTs: -1 })
    .limit(opts.limit || 50)
    .lean() as any;
}

/** Update parent message thread metadata (replyCount, lastReplyAt, participants) */
export async function updateParentThreadMetadata(
  orgId: string,
  channelId: string,
  threadTs: string
): Promise<void> {
  try {
    const replies = await SlackMessage.find({
      channelId,
      threadTs,
      isThreadReply: true,
      isDeleted: false
    })
      .sort({ slackTs: 1 })
      .lean() as any[];

    if (!replies.length) {
      await SlackMessage.updateOne(
        { channelId, slackTs: threadTs },
        { $set: { replyCount: 0, thread: null } }
      );
      return;
    }

    const replyCount = replies.length;
    
    // Convert slackTs to lastReplyAt ISO/Date
    const lastReply = replies[replies.length - 1];
    const lastReplyAt = lastReply.createdAt || new Date(Number(lastReply.slackTs) * 1000);

    // Get unique participants, maintaining their displayNames and avatars
    const senderIds = Array.from(new Set(replies.map(r => r.senderSlackUserId)));
    const participantCount = senderIds.length;

    const participants = [];
    for (const senderId of senderIds) {
      // Find the first reply by this sender to get their cached displayName/avatar
      const firstReplyFromSender = replies.find(r => r.senderSlackUserId === senderId);
      participants.push({
        displayName: firstReplyFromSender?.senderDisplayName || 'Workspace Member',
        avatar: firstReplyFromSender?.senderAvatar || ''
      });
    }

    await SlackMessage.updateOne(
      { channelId, slackTs: threadTs },
      {
        $set: {
          replyCount,
          thread: {
            replyCount,
            lastReplyAt,
            participantCount,
            participants
          }
        }
      }
    );
    console.log(`[slack:thread] Updated parent thread metadata for thread ${threadTs}. replyCount: ${replyCount}`);
  } catch (err: any) {
    console.error(`[slack:thread] Failed to update parent thread metadata for ${threadTs}:`, err.message || err);
  }
}
