import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../server/src/models/User';

// Load from root directory .env
dotenv.config({ path: '../.env' });
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  if (!MONGO_URI) {
    console.error("MONGODB_URI is not defined");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const users = await User.find().select('name email username role weekendSettings').lean();
  console.log('Users found:', users.length);
  users.forEach(u => {
    console.log(`Name: ${u.name} | Email: ${u.email} | Username: ${u.username} | Role: ${u.role} | WeekendSettings: ${JSON.stringify(u.weekendSettings)}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
