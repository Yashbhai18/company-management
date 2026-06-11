import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../server/src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const users = await User.find().select('name email username role twoFactorEnabled').lean();
  console.log('Users found:', users.length);
  users.forEach(u => {
    console.log(`Name: ${u.name} | Email: ${u.email} | Username: ${u.username} | Role: ${u.role} | 2FA: ${u.twoFactorEnabled}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
