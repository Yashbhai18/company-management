import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WebClient } from '@slack/web-api';
import { SlackWorkspace } from './src/models/SlackWorkspace';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  const ws = await SlackWorkspace.findOne({ isActive: true });
  if (!ws) {
    console.log('No active workspace');
    process.exit(1);
  }

  const client = new WebClient(ws.getBotToken());
  const convs = await client.conversations.list({ types: 'public_channel,private_channel' });
  
  for (const channel of convs.channels || []) {
    console.log('Checking channel:', channel.name);
    try {
      const history = await client.conversations.history({ channel: channel.id as string, limit: 20 });
      const msgWithFile = history.messages?.find(m => m.files && m.files.length > 0);
      
      if (msgWithFile) {
        console.log('FOUND MESSAGE WITH FILE IN', channel.name);
        console.log(JSON.stringify(msgWithFile, null, 2));
        process.exit(0);
      }
    } catch (e) {
      console.log('Could not read channel', channel.name);
    }
  }

  console.log('No message with file found anywhere.');
  process.exit(0);
}

run().catch(console.error);
