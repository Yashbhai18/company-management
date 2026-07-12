import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from '../../models/SlackWorkspace';
import { SlackUser, ISlackUser } from '../../models/SlackUser';
import { User } from '../../models/User';

/** Get a WebClient for an org's workspace */
async function getClient(orgId: string): Promise<{ client: WebClient; ws: typeof SlackWorkspace.prototype }> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) throw new Error('No active Slack workspace for this organization');
  const client = new WebClient(ws.getBotToken());
  return { client, ws };
}

/**
 * Sync all users from Slack into the MongoDB SlackUser cache.
 * Also attempts to link Slack users to local platform users via email.
 */
export async function syncUsers(orgId: string): Promise<number> {
  const { client, ws } = await getClient(orgId);
  let cursor: string | undefined;
  let count = 0;

  do {
    const res = await client.users.list({ cursor, limit: 200 });
    if (!res.ok || !res.members) break;

    for (const member of res.members) {
      if (!member.id) continue;
      const profile = member.profile || {};

      // Find local user by email for soft-link
      const email = (profile as any).email?.toLowerCase();
      let localUserId: any = null;
      if (email) {
        const localUser = await User.findOne({ orgId, email }).select('_id').lean();
        if (localUser) localUserId = localUser._id;
      }

      await SlackUser.findOneAndUpdate(
        { slackUserId: member.id, workspaceId: ws.workspaceId },
        {
          slackUserId: member.id,
          workspaceId: ws.workspaceId,
          orgId,
          name: member.name || member.id,
          displayName: (profile as any).display_name || member.name || member.id,
          realName: (profile as any).real_name || '',
          email,
          avatar: (profile as any).image_72 || (profile as any).image_48 || '',
          timezone: member.tz || '',
          timezoneOffset: member.tz_offset || 0,
          isBot: member.is_bot || false,
          isDeleted: member.deleted || false,
          localUserId,
        },
        { upsert: true, new: true }
      );
      count++;
    }

    cursor = (res.response_metadata as any)?.next_cursor;
  } while (cursor);

  const dbUserCount = await SlackUser.countDocuments({ workspaceId: ws.workspaceId });
  console.log("Database user count:", dbUserCount);

  return count;
}

/** Get a single user's presence from Slack and update cache */
export async function getPresence(orgId: string, slackUserId: string): Promise<'active' | 'away'> {
  const { client } = await getClient(orgId);
  const res = await client.users.getPresence({ user: slackUserId });
  const presence = (res.presence as 'active' | 'away') || 'away';

  await SlackUser.updateOne(
    { slackUserId, orgId },
    { $set: { presence } }
  );

  return presence;
}

/** Get cached users for an org */
export async function getCachedUsers(orgId: string): Promise<ISlackUser[]> {
  return SlackUser.find({ orgId, isDeleted: false }).lean() as any;
}

/** Get a single cached user */
export async function getCachedUser(orgId: string, slackUserId: string): Promise<ISlackUser | null> {
  return SlackUser.findOne({ orgId, slackUserId }).lean() as any;
}
