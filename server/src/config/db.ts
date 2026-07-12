import mongoose from 'mongoose';
import { MONGODB_URI } from './env';

/** Connects to MongoDB with retries and helpful logging */
export const connectDB = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set');
  try {
    await mongoose.connect(MONGODB_URI, {
      autoIndex: true,
    } as mongoose.ConnectOptions);
    console.info('MongoDB connected');

    // Run self-healing migration for historical thread replies
    try {
      const { SlackMessage } = await import('../models/SlackMessage');
      const unmigrated = await SlackMessage.find({
        threadTs: { $ne: null },
        isThreadReply: { $ne: true }
      });
      let migratedCount = 0;
      for (const msg of unmigrated) {
        if (msg.threadTs && msg.threadTs !== msg.slackTs) {
          msg.isThreadReply = true;
          msg.parentTs = msg.threadTs;
          await msg.save();
          migratedCount++;
        }
      }
      if (migratedCount > 0) {
        console.info(`[migration] Successfully migrated ${migratedCount} historical thread replies.`);
      }

      // Recalculate thread summaries for all historical threads
      const { updateParentThreadMetadata } = await import('../integrations/slack/messages.service');
      const parentMessages = await SlackMessage.find({
        threadTs: { $ne: null },
        isThreadReply: { $ne: true }
      });
      for (const parent of parentMessages) {
        await updateParentThreadMetadata(
          parent.orgId.toString(),
          parent.channelId,
          parent.slackTs
        );
      }
      if (parentMessages.length > 0) {
        console.info(`[migration] Successfully recalculated metadata for ${parentMessages.length} historical parent threads.`);
      }
    } catch (migErr: any) {
      console.warn('[migration] Historical thread replies migration failed:', migErr.message || migErr);
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
    // retry once after short delay then rethrow
    await new Promise((r) => setTimeout(r, 2000));
    await mongoose.connect(MONGODB_URI);
  }
};
