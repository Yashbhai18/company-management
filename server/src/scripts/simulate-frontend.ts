import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { User } from '../models/User';
import * as channelsService from '../integrations/slack/channels.service';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) throw new Error('No active workspace');
  
  const yash = await User.findOne({ email: 'yashindia06@gmail.com' }).select('slack').lean();
  if (!yash) throw new Error('No user found');
  
  console.log('\n--- 5. Simulating Frontend Click on Tanmay ---');
  console.log('Recipient Slack User ID (Tanmay): U0BEH29EQ6B');
  console.log('Sender User ID (Yash):', yash._id.toString());
  console.log('Workspace ID:', ws.workspaceId);
  
  try {
    const dmChannel = await channelsService.openDMConversation(ws.orgId.toString(), 'U0BEH29EQ6B', yash._id.toString());
    console.log('\nReturned DM Channel:');
    console.log('- Mongo Conversation ID:', dmChannel._id.toString());
    console.log('- Slack Conversation ID:', dmChannel.slackChannelId);
    console.log('- DM User Slack ID:', dmChannel.dmUserSlackId);
    console.log('- Sender Slack User ID:', dmChannel.senderSlackUserId);
  } catch (e: any) {
    console.log('Error opening DM:', e.message);
  }

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
