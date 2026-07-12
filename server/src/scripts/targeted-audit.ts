import mongoose from 'mongoose';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { SlackMessage } from '../models/SlackMessage';
import { User } from '../models/User';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) throw new Error('No active workspace');
  
  const botClient = new WebClient(ws.getBotToken());
  const TARGET_CHANNEL = 'D0BEV4A8W8M';
  
  console.log('\n--- 1. Target Audit for: ' + TARGET_CHANNEL + ' ---');
  
  // We need Yash's user token because it's a Yash <-> Tanmay DM
  let userTokenClient = botClient;
  let userClientReady = false;
  
  const yash = await User.findOne({ email: 'yashindia06@gmail.com' }).select('slack').lean();
  if (yash?.slack?.connected) {
    const { getUserAccessToken } = await import('../integrations/slack/oauth.service');
    const token = await getUserAccessToken(yash._id.toString());
    if (token) {
      userTokenClient = new WebClient(token);
      userClientReady = true;
      console.log('Using Yash\'s User Token to query.');
    }
  } else {
    console.log('No connected user token found for Yash, using bot token.');
  }

  // 1. Call conversations.info
  try {
    const info = await userTokenClient.conversations.info({ channel: TARGET_CHANNEL });
    console.log('\n2. conversations.info (User Token):');
    const ch: any = info.channel || {};
    console.log({
      id: ch.id,
      user: ch.user,
      is_im: ch.is_im,
      is_member: ch.is_member,
      context_team_id: ch.context_team_id,
      internal_team_ids: ch.internal_team_ids,
    });
  } catch (e: any) {
    console.log('conversations.info Error (User Token):', e.message);
  }

  // 2. Call conversations.history
  try {
    const hist = await userTokenClient.conversations.history({ channel: TARGET_CHANNEL });
    console.log('\n3. conversations.history (User Token):');
    if (hist.messages) {
      console.log(`Found ${hist.messages.length} messages.`);
      hist.messages.forEach(m => {
        console.log(`- ts: ${m.ts}, sender: ${m.user}, text: "${m.text?.slice(0, 30)}"`);
      });
    }
  } catch (e: any) {
    console.log('conversations.history Error (User Token):', e.message);
  }
  
  // 3. Search MongoDB for messages in this channel
  const dbMessages = await SlackMessage.find({ channelId: TARGET_CHANNEL }).sort({ slackTs: -1 }).lean();
  console.log(`\n4. MongoDB Messages for ${TARGET_CHANNEL}:`);
  console.log(`Found ${dbMessages.length} messages in DB.`);
  dbMessages.forEach(m => {
    console.log(`- ts: ${m.slackTs}, sender: ${m.senderSlackUserId}, text: "${m.text?.slice(0, 30)}"`);
  });

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
