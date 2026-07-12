import { WebClient } from '@slack/web-api';
import mongoose from 'mongoose';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, CLIENT_URL } from '../../config/env';
import crypto from 'crypto';

const OAUTH_SCOPES = [
  'channels:history', 'channels:read', 'channels:manage', 'channels:join',
  'chat:write',
  'files:read', 'files:write',
  'groups:history', 'groups:read', 'groups:write',
  'im:history', 'im:read', 'im:write',
  'mpim:history', 'mpim:read', 'mpim:write',
  'reactions:read', 'reactions:write',
  'users:read', 'users:read.email',
].join(',');

const REDIRECT_URI = `${CLIENT_URL.replace(':3000', ':4000')}/api/slack/oauth/callback`;
const USER_REDIRECT_URI = `${CLIENT_URL.replace(':3000', ':4000')}/api/slack/user/callback`;

/**
 * Generate the Slack OAuth 2.0 authorization URL for Workspace connection.
 */
export function generateOAuthUrl(orgId: string): string {
  if (!SLACK_CLIENT_ID) {
    throw new Error('Slack Client ID is not configured in the backend .env file');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ orgId, nonce })).toString('base64url');

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: OAUTH_SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Generate the Slack OAuth 2.0 authorization URL for User connection.
 */
export function generateUserOAuthUrl(orgId: string, userId: string): string {
  if (!SLACK_CLIENT_ID) {
    throw new Error('Slack Client ID is not configured in the backend .env file');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ orgId, userId, type: 'user', nonce })).toString('base64url');

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: 'chat:write,channels:read,groups:read,im:read,im:write,im:history,mpim:read,users:read,reactions:write,files:read,files:write',
    redirect_uri: REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchange the Workspace OAuth authorization code for tokens.
 */
export async function exchangeCode(
  code: string,
  rawState: string,
  installedBy: string
): Promise<{ workspaceId: string; teamName: string }> {
  let stateData: any;
  try {
    stateData = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid OAuth state parameter');
  }

  const orgId = stateData.orgId;

  const client = new WebClient();
  const result = await client.oauth.v2.access({
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  });

  if (!result.ok) {
    throw new Error(`Slack OAuth token exchange failed: ${(result as any).error || 'unknown error'}`);
  }

  if (!result.access_token || !result.team) {
    throw new Error('Slack OAuth token exchange failed to return bot credentials');
  }

  const botToken: string = result.access_token as string;
  const teamId: string = (result.team as any).id as string;
  const teamName: string = (result.team as any).name as string;
  const scope: string = (result.scope as string) || '';
  const botUserId: string = (result.bot_user_id as string) || '';
  const accessToken: string = (result.authed_user as any)?.access_token || '';

  // Explicitly encrypt tokens since findOneAndUpdate does not run pre-save hooks
  const { encryptToken } = await import('../../utils/slackCrypto');
  const botTokenEncrypted = encryptToken(botToken);
  const accessTokenEncrypted = accessToken ? encryptToken(accessToken) : '';

  await SlackWorkspace.findOneAndUpdate(
    { orgId },
    {
      orgId,
      workspaceId: teamId,
      teamName,
      botTokenEncrypted,
      accessTokenEncrypted,
      installedBy,
      scope,
      botUserId,
      isActive: true,
    },
    { upsert: true, new: true }
  );

  return { workspaceId: teamId, teamName };
}

/**
 * Exchange the User-level Slack OAuth code for user access token and metadata.
 */
export async function exchangeUserCode(
  code: string,
  rawState: string
): Promise<{ teamId: string; teamName: string; slackUserId: string }> {
  let stateData: any;
  try {
    stateData = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid OAuth state parameter');
  }

  const client = new WebClient();
  const result = await client.oauth.v2.access({
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  });

  if (!result.ok) {
    throw new Error(`Slack User OAuth token exchange failed: ${(result as any).error || 'unknown error'}`);
  }

  const userToken = result.authed_user?.access_token;
  const slackUserId = result.authed_user?.id;
  const teamId = result.team?.id;
  const teamName = result.team?.name;

  if (!userToken || !slackUserId || !teamId) {
    throw new Error('Slack User OAuth token exchange did not return user access token');
  }

  // Get user details using user token
  let slackDisplayName = '';
  let slackUsername = '';
  try {
    const userClient = new WebClient(userToken);
    const authTest = await userClient.auth.test();
    slackUsername = authTest.user || '';

    const userInfo = await userClient.users.info({ user: slackUserId });
    if (userInfo.ok && userInfo.user) {
      slackDisplayName = userInfo.user.profile?.display_name || userInfo.user.real_name || userInfo.user.name || '';
    }
  } catch (err) {
    console.warn('[slack:oauth] Failed to retrieve user details via auth.test/users.info', err);
  }

  const { encryptToken } = await import('../../utils/slackCrypto');
  const accessTokenEncrypted = encryptToken(userToken);
  const refreshTokenEncrypted = result.authed_user?.refresh_token ? encryptToken(result.authed_user.refresh_token) : null;
  const expiresAt = (result.authed_user as any)?.expires_in
    ? new Date(Date.now() + (result.authed_user as any).expires_in * 1000)
    : null;

  const { User } = await import('../../models/User');
  await User.findByIdAndUpdate(stateData.userId, {
    $set: {
      slack: {
        connected: true,
        teamId,
        teamName: teamName || '',
        slackUserId,
        slackDisplayName: slackDisplayName || slackUsername || 'Slack User',
        slackUsername: slackUsername || 'slack_user',
        accessToken: accessTokenEncrypted,
        refreshToken: refreshTokenEncrypted,
        expiresAt,
        scopes: result.authed_user?.scope || '',
        connectedAt: new Date()
      }
    }
  });

  // Purge all bot-created DM channels for this user so the next openDMConversation
  // call will re-open using the fresh User token and get the correct D... channel.
  try {
    const { SlackChannel } = await import('../../models/SlackChannel');
    const { SlackMessage } = await import('../../models/SlackMessage');

    // Find all bot-created DMs where this user was the sender (by slackUserId)
    const botDMs = await SlackChannel.find({
      isIm: true,
      $or: [
        { createdWith: 'bot' },
        { createdWith: null },      // legacy entries with no metadata
      ],
      senderSlackUserId: slackUserId, // only purge THIS user's stale DMs
    }).lean();

    if (botDMs.length > 0) {
      const botDmChannelIds = botDMs.map((ch: any) => ch.slackChannelId);
      const deletedChannels = await SlackChannel.deleteMany({ slackChannelId: { $in: botDmChannelIds } });
      const deletedMessages = await SlackMessage.deleteMany({ channelId: { $in: botDmChannelIds } });
      console.log(
        `[slack:oauth] Purged ${deletedChannels.deletedCount} bot-created DM channel(s) and ${deletedMessages.deletedCount} message(s) for user ${slackUserId} on reconnect.`
      );
    } else {
      console.log(`[slack:oauth] No bot-created DM channels found for user ${slackUserId}. Nothing to purge.`);
    }
  } catch (purgeErr: any) {
    console.warn('[slack:oauth] Failed to purge bot-created DM channels on reconnect:', purgeErr.message);
  }

  return { teamId, teamName: teamName || '', slackUserId };
}

/**
 * Revoke the bot token and mark the workspace as inactive.
 */
export async function disconnectWorkspace(orgId: string): Promise<void> {
  const ws = await SlackWorkspace.findOne({ orgId });
  if (!ws) return;

  try {
    const client = new WebClient(ws.getBotToken());
    await client.auth.revoke();
  } catch {
    // Best-effort revoke — still mark inactive
  }

  ws.isActive = false;
  await ws.save();
}

/**
 * Disconnect an individual user's Slack account.
 */
export async function disconnectUserAccount(userId: string): Promise<void> {
  const { User } = await import('../../models/User');
  const user = await User.findById(userId);
  if (!user || !user.slack || !user.slack.connected) return;

  if (user.slack.accessToken) {
    try {
      const { decryptToken, isEncryptedToken } = await import('../../utils/slackCrypto');
      const token = isEncryptedToken(user.slack.accessToken)
        ? decryptToken(user.slack.accessToken)
        : user.slack.accessToken;
      const client = new WebClient(token);
      await client.auth.revoke();
    } catch {
      // Best-effort
    }
  }

  await User.findByIdAndUpdate(userId, {
    $set: {
      slack: {
        connected: false,
        teamId: null,
        teamName: null,
        slackUserId: null,
        slackDisplayName: null,
        slackUsername: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        scopes: null,
        connectedAt: null
      }
    }
  });
}

/**
 * Safely retrieves the decrypted Slack User Access Token, automatically refreshing it if expired.
 */
export async function getUserAccessToken(userDocOrId: any): Promise<string | null> {
  const { User } = await import('../../models/User');
  let user: any;
  if (typeof userDocOrId === 'string' || userDocOrId instanceof mongoose.Types.ObjectId) {
    user = await User.findById(userDocOrId);
  } else {
    user = await User.findById(userDocOrId._id);
  }

  if (!user || !user.slack || !user.slack.connected || !user.slack.accessToken) {
    return null;
  }

  // Check if token has expired or is expiring soon (within 60 seconds)
  if (user.slack.expiresAt && user.slack.refreshToken && new Date(user.slack.expiresAt).getTime() - 60000 < Date.now()) {
    console.log(`[slack:oauth] User Slack token is expired or expiring soon. Attempting refresh...`);
    try {
      const { decryptToken, isEncryptedToken, encryptToken } = await import('../../utils/slackCrypto');
      const decryptedRefresh = isEncryptedToken(user.slack.refreshToken)
        ? decryptToken(user.slack.refreshToken)
        : user.slack.refreshToken;

      const client = new WebClient();
      const res = await client.oauth.v2.access({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefresh,
      });

      if (res.ok && res.access_token) {
        console.log(`[slack:oauth] Successfully refreshed user token.`);
        const newAccess = encryptToken(res.access_token);
        const newRefresh = res.refresh_token ? encryptToken(res.refresh_token) : null;
        const newExpires = (res as any).expires_in
          ? new Date(Date.now() + (res as any).expires_in * 1000)
          : null;

        user.slack.accessToken = newAccess;
        if (newRefresh) user.slack.refreshToken = newRefresh;
        if (newExpires) user.slack.expiresAt = newExpires;
        user.slack.scopes = res.scope || user.slack.scopes;
        await user.save();
      } else {
        console.error(`[slack:oauth] Refresh token exchange returned error:`, (res as any).error);
      }
    } catch (err: any) {
      console.error(`[slack:oauth] Failed to refresh User Slack token:`, err.message || err);
    }
  }

  try {
    const { decryptToken, isEncryptedToken } = await import('../../utils/slackCrypto');
    const decrypted = isEncryptedToken(user.slack.accessToken)
      ? decryptToken(user.slack.accessToken)
      : user.slack.accessToken;
    return decrypted;
  } catch (err) {
    console.error(`[slack:oauth] Decryption of access token failed:`, err);
    return null;
  }
}

/** Get the active workspace for an org, or throw 404-style error. */
export async function getWorkspace(orgId: string): Promise<any> {
  return SlackWorkspace.findOne({ orgId, isActive: true }).lean();
}
