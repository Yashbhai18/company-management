import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackChannel, ISlackChannel } from '../../models/SlackChannel';

async function getClient(orgId: string): Promise<{ client: WebClient; ws: typeof SlackWorkspace.prototype }> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace for this organization');
  return { client: new WebClient(ws.getBotToken()), ws };
}

/** Sync all conversations (channels, DMs, MPIMs) into MongoDB cache */
export async function syncChannels(orgId: string): Promise<number> {
  const { client, ws } = await getClient(orgId);
  
  // 1. Verify Slack Authentication
  try {
    const auth = await client.auth.test();
    console.log("Slack Auth test response:", auth);
  } catch (err: any) {
    console.error("Slack Auth test failed! Response:", err.response?.data || err.message || err);
  }

  // 2. Test Slack API directly (conversations.list)
  try {
    const testList = await client.conversations.list({
      types: "public_channel,private_channel,im,mpim",
      exclude_archived: true,
      limit: 1000
    });
    console.log("Slack conversations.list() test:", {
      ok: testList.ok,
      error: (testList as any).error,
      count: testList.channels?.length
    });
    if (!testList.channels || testList.channels.length === 0) {
      console.log("Full conversations.list response:", JSON.stringify(testList, null, 2));
    }
  } catch (err: any) {
    console.error("conversations.list test failed:", err.message || err);
  }

  // 3. Verify Users
  try {
    const users = await client.users.list({});
    console.log("Slack users.list() test:", {
      ok: users.ok,
      error: (users as any).error,
      count: users.members?.length
    });
  } catch (err: any) {
    console.error("users.list test failed:", err.message || err);
  }

  let cursor: string | undefined;
  let count = 0;
  const types = 'public_channel,private_channel,im,mpim';

  do {
    const res = await client.conversations.list({ cursor, limit: 200, types });
    if (!res.ok || !res.channels) {
      console.log("Sync conversations.list fetch page returned not OK or no channels:", {
        ok: res.ok,
        error: (res as any).error
      });
      break;
    }

    console.log("Saving channels:", res.channels.length);

    for (const ch of res.channels) {
      if (!ch.id) continue;
      await SlackChannel.findOneAndUpdate(
        { slackChannelId: ch.id, workspaceId: ws.workspaceId },
        {
          slackChannelId: ch.id,
          workspaceId: ws.workspaceId,
          orgId,
          name: ch.name || ch.id,
          topic: (ch as any).topic?.value || '',
          purpose: (ch as any).purpose?.value || '',
          memberCount: (ch as any).num_members || 0,
          isPrivate: ch.is_private || false,
          isArchived: ch.is_archived || false,
          isIm: ch.is_im || false,
          isMpim: ch.is_mpim || false,
          dmUserSlackId: (ch as any).user || null,
        },
        { upsert: true, new: true }
      );
      count++;
    }

    cursor = (res.response_metadata as any)?.next_cursor;
  } while (cursor);

  const dbCount = await SlackChannel.countDocuments({ workspaceId: ws.workspaceId });
  console.log("Database channel count:", dbCount);

  return count;
}

/** Create a new Slack channel */
export async function createChannel(
  orgId: string,
  name: string,
  isPrivate: boolean = false
): Promise<ISlackChannel> {
  const { client, ws } = await getClient(orgId);
  const res = await client.conversations.create({ name, is_private: isPrivate });
  if (!res.ok || !res.channel?.id) throw new Error('Failed to create Slack channel');
  const ch = res.channel;

  return SlackChannel.findOneAndUpdate(
    { slackChannelId: ch.id, workspaceId: ws.workspaceId },
    {
      slackChannelId: ch.id,
      workspaceId: ws.workspaceId,
      orgId,
      name: ch.name || name,
      isPrivate: ch.is_private || isPrivate,
      isArchived: false,
      isIm: false,
      isMpim: false,
    },
    { upsert: true, new: true }
  ) as any;
}

/** Archive a Slack channel */
export async function archiveChannel(orgId: string, slackChannelId: string): Promise<void> {
  const { client } = await getClient(orgId);
  await client.conversations.archive({ channel: slackChannelId });
  await SlackChannel.updateOne({ slackChannelId, orgId }, { $set: { isArchived: true } });
}

/** Rename a Slack channel */
export async function renameChannel(orgId: string, slackChannelId: string, name: string): Promise<void> {
  const { client } = await getClient(orgId);
  await client.conversations.rename({ channel: slackChannelId, name });
  await SlackChannel.updateOne({ slackChannelId, orgId }, { $set: { name } });
}

/** Get channel members */
export async function getChannelMembers(orgId: string, slackChannelId: string): Promise<string[]> {
  const { client } = await getClient(orgId);
  const res = await client.conversations.members({ channel: slackChannelId });
  return (res.members || []) as string[];
}

/** Structured error thrown when a DM requires a user token but scopes are missing */
export class DmScopeError extends Error {
  code = 'slack_reconnect_required';
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'DmScopeError';
  }
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
      throw new Error('Slack account connection required.');
    }

    const { getUserAccessToken } = await import('./oauth.service');
    const token = await getUserAccessToken(senderUserId);
    if (token) {
      const scopes = user.slack.scopes || '';
      const activeScopes = scopes.split(',').map((s: string) => s.trim());
      const hasImWrite = activeScopes.includes('im:write');

      if (opts.isDmContext && !hasImWrite) {
        // STRICT: never fall back to bot for DMs
        throw new DmScopeError(
          'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.'
        );
      }

      if (!opts.isDmContext && !hasImWrite) {
        // Non-DM contexts (channels): bot fallback is allowed
        console.warn(
          `[slack:auth] User token for user ${senderUserId} is missing 'im:write'. Falling back to Bot Token (non-DM context).`
        );
        return { client: new WebClient(ws.getBotToken()), ws, isUserToken: false };
      }

      return { client: new WebClient(token), ws, isUserToken: true };
    }

    // Token retrieval failed
    if (opts.isDmContext) {
      throw new DmScopeError(
        'Your Slack authorization is missing required Direct Message scopes. Please reconnect Slack.'
      );
    }
  }

  if (opts.isDmContext) {
    // Reached here without a senderUserId — should never happen in the DM flow
    throw new DmScopeError(
      'Cannot open a Direct Message without an authenticated user. Please reconnect Slack.'
    );
  }

  return { client: new WebClient(ws.getBotToken()), ws, isUserToken: false };
}

/** Fetch all non-archived channels from cache */
export async function getCachedChannels(
  orgId: string,
  opts: { userSlackUserId?: string | null; botUserId?: string | null; includeIm?: boolean } = {}
): Promise<ISlackChannel[]> {
  const query: any = { orgId, isArchived: false };
  
  if (opts.userSlackUserId) {
    query.$or = [
      { isIm: { $ne: true } }, // Public/private channels
      {
        isIm: true,
        $or: [
          { senderSlackUserId: opts.userSlackUserId },
          { dmUserSlackId: opts.userSlackUserId }
        ]
      }
    ];
  } else if (opts.includeIm === false) {
    query.isIm = { $ne: true };
  }

  return SlackChannel.find(query).sort({ name: 1 }).lean() as any;
}

/** Open or reuse a Slack DM conversation channel — STRICTLY requires a User OAuth token with im:write */
export async function openDMConversation(
  orgId: string,
  recipientSlackUserId: string,
  senderUserId?: string
): Promise<ISlackChannel> {
  // DMs ALWAYS require a User token — never allow bot fallback here
  const { client, ws } = await getClientForUser(orgId, senderUserId, { isDmContext: true });

  let senderSlackUserId: string | null = null;
  if (senderUserId) {
    const { User } = await import('../../models/User');
    const senderDoc = await User.findById(senderUserId).select('slack.slackUserId').lean() as any;
    senderSlackUserId = senderDoc?.slack?.slackUserId || null;
  }

  if (!senderSlackUserId) {
    const authTest = await client.auth.test();
    senderSlackUserId = authTest.user_id || authTest.bot_id || null;
  }

  // 1. Check cache — but REJECT any entry that was created with the bot token
  const existing = await SlackChannel.findOne({
    orgId,
    workspaceId: ws.workspaceId,
    isIm: true,
    dmUserSlackId: recipientSlackUserId,
    senderSlackUserId,
    createdWith: 'user',   // only trust user-token-created mappings
  });

  if (existing) {
    console.log(
      `[slack:dm] Reusing valid user-created DM channel: ${existing.slackChannelId} for recipient ${recipientSlackUserId} (sender: ${senderSlackUserId})`
    );
    return existing;
  }

  // Resolve display name for the channel record
  const { SlackUser } = await import('../../models/SlackUser');
  const recipientInfo = await SlackUser.findOne({ slackUserId: recipientSlackUserId, workspaceId: ws.workspaceId }).lean() as any;
  const displayName = recipientInfo?.displayName || recipientInfo?.realName || recipientInfo?.name || 'Direct Message';

  console.log(`[slack:dm] Opening DM with recipient ${recipientSlackUserId} using USER token (sender: ${senderSlackUserId})...`);
  const res = await client.conversations.open({ users: recipientSlackUserId });
  console.log(`[slack:dm] conversations.open() response:`, JSON.stringify(res, null, 2));

  if (!res.ok || !res.channel?.id) {
    throw new Error(`Slack API conversations.open failed: ${(res as any).error || 'unknown error'}`);
  }

  const dmChannelId = res.channel.id;
  console.log(`[slack:dm] Slack returned DM channel ID: ${dmChannelId} (user-created)`);

  // 2. Upsert with createdWith: 'user' — this is the canonical mapping
  const doc = await SlackChannel.findOneAndUpdate(
    { slackChannelId: dmChannelId, workspaceId: ws.workspaceId },
    {
      slackChannelId: dmChannelId,
      workspaceId: ws.workspaceId,
      orgId,
      name: displayName,
      isIm: true,
      isMpim: false,
      isPrivate: true,
      isArchived: false,
      dmUserSlackId: recipientSlackUserId,
      senderSlackUserId,
      createdWith: 'user',
    },
    { upsert: true, new: true }
  );

  return doc as any;
}
