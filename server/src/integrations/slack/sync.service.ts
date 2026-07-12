import { SlackWorkspace } from '../../models/SlackWorkspace';
import * as channelsService from './channels.service';
import * as usersService from './users.service';
import * as messagesService from './messages.service';

/**
 * Full workspace sync: channels → users → recent message history per channel.
 * Called immediately after OAuth install and periodically thereafter.
 */
export async function syncWorkspace(orgId: string): Promise<void> {
  const ws = await SlackWorkspace.findOne({ orgId, isActive: true });
  if (!ws) {
    console.warn(`[slack:sync] No active workspace found for orgId: ${orgId}`);
    return;
  }

  const botToken = ws.getBotToken();
  console.log("========== SLACK SYNC ==========");
  console.log("Org:", orgId);
  console.log("Workspace:", ws.workspaceId);
  console.log("User:", ws.installedBy);
  console.log("Bot Token Exists:", !!botToken);
  if (botToken) {
    console.log("Bot Token Prefix:", botToken.substring(0, 15) + "...");
  }

  console.info(`[slack:sync] Starting workspace sync for org ${orgId}`);

  // 1. Sync channels
  const channelCount = await channelsService.syncChannels(orgId);
  console.info(`[slack:sync] Synced ${channelCount} channels`);

  // 2. Sync users
  const userCount = await usersService.syncUsers(orgId);
  console.info(`[slack:sync] Synced ${userCount} users`);

  // 3. Fetch recent history for each channel (up to 50 messages)
  const channels = await channelsService.getCachedChannels(orgId);
  for (const channel of channels) {
    try {
      await messagesService.fetchHistory(orgId, channel.slackChannelId, { limit: 50 });
    } catch (err: any) {
      // Channels the bot is not a member of will fail — skip gracefully
      if (err?.data?.error !== 'not_in_channel' && err?.data?.error !== 'channel_not_found') {
        console.warn(`[slack:sync] Could not fetch history for ${channel.name}: ${err.message}`);
      }
    }
  }

  // Update lastSyncedAt
  await SlackWorkspace.updateOne({ orgId }, { $set: { lastSyncedAt: new Date() } });
  console.info(`[slack:sync] Workspace sync complete for org ${orgId}`);
}

/**
 * Schedule periodic background sync for all active workspaces.
 * Runs every 1 hour to catch any missed events.
 */
export function startPeriodicSync(intervalMs: number = 60 * 60 * 1000): void {
  setInterval(async () => {
    try {
      const workspaces = await SlackWorkspace.find({ isActive: true }).select('orgId').lean();
      for (const ws of workspaces) {
        await syncWorkspace((ws as any).orgId.toString()).catch((err) => {
          console.error(`[slack:sync] Periodic sync failed for org ${(ws as any).orgId}:`, err.message);
        });
      }
    } catch (err: any) {
      console.error('[slack:sync] Periodic sync scheduler error:', err.message);
    }
  }, intervalMs);
}
