import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SlackMessage } from './src/models/SlackMessage';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  const msg = await SlackMessage.findOne({}).sort({ createdAt: -1 }).lean();
  console.log(JSON.stringify(msg, null, 2));

  process.exit(0);
}

run().catch(console.error);
