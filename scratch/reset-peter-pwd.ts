import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from '../server/src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const hash = await bcrypt.hash('Password123', 12);
  const res = await User.updateOne({ email: 'plk@gmail.com' }, { $set: { passwordHash: hash } });
  console.log('Update result:', res);

  await mongoose.disconnect();
}

run().catch(console.error);
