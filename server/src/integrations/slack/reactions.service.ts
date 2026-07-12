import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackMessage } from '../../models/SlackMessage';

async function getClientForUser(
  orgId: string,
  userId?: string
): Promise<{ client: WebClient; ws: any }> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace');

  if (userId) {
    const { User } = await import('../../models/User');
    const user = await User.findById(userId).select('slack').lean();
    if (!user || !user.slack || !user.slack.connected) {
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
    const token = await getUserAccessToken(userId);
    if (token) {
      console.log(`[slack:reaction] Using User OAuth Token for user ${userId}`);
      return { client: new WebClient(token), ws };
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

  console.log(`[slack:reaction] Using Workspace Bot Token`);
  return { client: new WebClient(ws.getBotToken()), ws };
}

/** Add an emoji reaction to a Slack message. Idempotent. */
export async function addReaction(
  orgId: string,
  channelId: string,
  ts: string,
  emoji: string,
  slackUserId: string,
  userId?: string
): Promise<void> {
  const { client } = await getClientForUser(orgId, userId);
  try {
    await client.reactions.add({ channel: channelId, timestamp: ts, name: emoji });
  } catch (e: any) {
    // "already_reacted" is acceptable
    if (e.data?.error !== 'already_reacted') throw e;
  }

  // Update cached reactions
  const msg = await SlackMessage.findOne({ channelId, slackTs: ts });
  if (msg) {
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
  }
}

/** Remove an emoji reaction. Idempotent. */
export async function removeReaction(
  orgId: string,
  channelId: string,
  ts: string,
  emoji: string,
  slackUserId: string,
  userId?: string
): Promise<void> {
  const { client } = await getClientForUser(orgId, userId);
  try {
    await client.reactions.remove({ channel: channelId, timestamp: ts, name: emoji });
  } catch (e: any) {
    if (e.data?.error !== 'no_reaction') throw e;
  }

  const msg = await SlackMessage.findOne({ channelId, slackTs: ts });
  if (msg) {
    const existing = msg.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      existing.userIds = existing.userIds.filter((u) => u !== slackUserId);
      existing.count = existing.userIds.length;
      msg.reactions = msg.reactions.filter((r) => r.count > 0);
    }
    msg.markModified('reactions');
    await msg.save();
  }
}
