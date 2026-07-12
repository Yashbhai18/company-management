import mongoose from 'mongoose';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { SlackChannel } from '../models/SlackChannel';
import { SlackMessage } from '../models/SlackMessage';
import { User } from '../models/User';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) throw new Error('No active workspace');
  const orgId = ws.orgId;
  
  const client = new WebClient(ws.getBotToken());

  const dms = await SlackChannel.find({ orgId, isIm: true });
  
  for (const dm of dms) {
    console.log('\n=======================================');
    console.log('1. Mongo conversation ID:', dm._id.toString());
    console.log('2. Slack conversation ID (Dxxxxxxxx):', dm.slackChannelId);
    console.log('3. Slack recipient user ID (Uxxxxxxxx):', dm.dmUserSlackId);
    console.log('   Sender Slack user ID:', dm.senderSlackUserId);
    
    let clientToUse = client;
    if (dm.senderSlackUserId && dm.senderSlackUserId !== 'USLACKBOT') {
      const user = await User.findOne({ 'slack.slackUserId': dm.senderSlackUserId }).select('slack').lean();
      if (user?.slack?.connected) {
        const { getUserAccessToken } = await import('../integrations/slack/oauth.service');
        const token = await getUserAccessToken(user._id.toString());
        if (token) clientToUse = new WebClient(token);
      }
    }
    
    console.log(`\n4. Fetching conversations.history(${dm.slackChannelId})...`);
    let slackMessages: any[] = [];
    try {
      const res = await clientToUse.conversations.history({ channel: dm.slackChannelId, limit: 100 });
      slackMessages = res.messages || [];
      console.log(`   Fetched ${slackMessages.length} messages from Slack.`);
    } catch (e: any) {
      if (e.data?.error === 'missing_scope' && clientToUse !== client) {
        console.log('   User token missing scope, falling back to bot token...');
        try {
          const res = await client.conversations.history({ channel: dm.slackChannelId, limit: 100 });
          slackMessages = res.messages || [];
          console.log(`   Fetched ${slackMessages.length} messages from Slack (using bot token).`);
        } catch (botErr: any) {
          console.log('   Error fetching from Slack with bot token:', botErr.message);
        }
      } else {
        console.log('   Error fetching from Slack:', e.message);
      }
    }
    
    const dbMessages = await SlackMessage.find({ channelId: dm.slackChannelId }).sort({ slackTs: -1 }).lean();
    console.log(`   Found ${dbMessages.length} messages in MongoDB.`);
    
    console.log('\n5. Comparing messages...');
    const slackTsSet = new Set(slackMessages.map(m => m.ts));
    const dbTsSet = new Set(dbMessages.map(m => m.slackTs));
    
    let dbOnlyCount = 0;
    for (const dbM of dbMessages) {
      if (!slackTsSet.has(dbM.slackTs)) {
        console.log(`   [WARNING] DB-only message found! Ts: ${dbM.slackTs}, Text: "${dbM.text}"`);
        dbOnlyCount++;
      }
    }
    
    let slackOnlyCount = 0;
    for (const sM of slackMessages) {
      if (!dbTsSet.has(sM.ts)) {
        console.log(`   [WARNING] Slack-only message found! Ts: ${sM.ts}, Text: "${sM.text}"`);
        slackOnlyCount++;
      }
    }
    
    if (dbOnlyCount === 0 && slackOnlyCount === 0) {
      console.log('   Sync state: MATCH. MongoDB and Slack are fully synchronized.');
    } else {
      console.log(`   Sync state: MISMATCH. DB-only: ${dbOnlyCount}, Slack-only: ${slackOnlyCount}.`);
    }
  }

  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
