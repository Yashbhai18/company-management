import mongoose from 'mongoose';
import { connectDB } from './server/src/config/db';
import { SlackChannel } from './server/src/models/SlackChannel';

async function run() {
  await connectDB();
  const doc = await SlackChannel.findOne({ slackChannelId: 'D0BED530YB1' }).lean();
  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
}
run().catch(console.error);
