import mongoose from 'mongoose';
import { connectDB } from './server/src/config/db';
import { SlackWorkspace } from './server/src/models/SlackWorkspace';
import { SlackChannel } from './server/src/models/SlackChannel';
import { postMessage } from './server/src/integrations/slack/messages.service';
import { User } from './server/src/models/User';

async function run() {
  await connectDB();
  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) {
    console.log('No workspace found');
    process.exit(0);
  }
  
  const orgId = ws.orgId;
  const channel = await SlackChannel.findOne({ orgId, isPrivate: false });
  if (!channel) {
    console.log('No public channel found');
    process.exit(0);
  }
  
  const user = await User.findOne({ 'slack.connected': true, 'role': 'super_admin' });
  const senderUserId = user ? user._id.toString() : undefined;
  
  console.log(`Sending message to channel: ${channel.name} (${channel.slackChannelId}) by user: ${senderUserId}`);
  
  try {
    const msg = await postMessage(orgId.toString(), channel.slackChannelId, 'Test message', {
      senderUserId
    });
    console.log('Message posted successfully:', msg.slackTs);
  } catch (err: any) {
    console.error('Error posting message:');
    if (err.details) {
      console.error(JSON.stringify(err.details, null, 2));
    } else {
      console.error(err);
    }
  }
  process.exit(0);
}

run().catch(console.error);
