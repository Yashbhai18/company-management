/**
 * Migration: Purge all bot-created DM channels and their messages.
 *
 * Targets every SlackChannel where:
 *   - isIm === true
 *   - createdWith === 'bot'  OR  createdWith is null/missing (legacy entries)
 *
 * Also deletes all associated SlackMessage documents for the affected channel IDs.
 *
 * Usage:
 *   npx ts-node server/src/scripts/migrate-purge-bot-dms.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { SlackChannel } from '../models/SlackChannel';
import { SlackMessage } from '../models/SlackMessage';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to MongoDB.\n');

  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) throw new Error('No active Slack workspace found.');

  // Find all bot-created or legacy (untagged) DM channels
  const botDMs = await SlackChannel.find({
    isIm: true,
    $or: [
      { createdWith: 'bot' },
      { createdWith: null },       // legacy entries created before this field existed
      { createdWith: { $exists: false } },
    ],
  }).lean();

  console.log(`Found ${botDMs.length} bot-created / legacy DM channel(s) to purge.`);

  if (botDMs.length === 0) {
    console.log('Nothing to purge. All DM channels are clean.\n');
    process.exit(0);
  }

  for (const dm of botDMs) {
    console.log(
      `  - ${dm.slackChannelId} | recipient: ${dm.dmUserSlackId} | sender: ${dm.senderSlackUserId} | createdWith: ${(dm as any).createdWith ?? 'null'}`
    );
  }

  const channelIds = botDMs.map(ch => ch.slackChannelId);

  // Delete the messages first
  const deletedMsgs = await SlackMessage.deleteMany({ channelId: { $in: channelIds } });
  console.log(`\nDeleted ${deletedMsgs.deletedCount} message(s).`);

  // Delete the channel records
  const deletedChannels = await SlackChannel.deleteMany({ slackChannelId: { $in: channelIds } });
  console.log(`Deleted ${deletedChannels.deletedCount} channel record(s).`);

  console.log('\n✅ Migration complete. All bot-created DM channels have been purged.');
  console.log('   Users must reconnect Slack to re-open their DMs using their personal user token.');

  process.exit(0);
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message || e);
  process.exit(1);
});
