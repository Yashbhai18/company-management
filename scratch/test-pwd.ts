import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from '../server/src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const u = await User.findOne({ email: 'plk@gmail.com' });
  if (!u) {
    console.log('Peter not found');
    process.exit(1);
  }

  const check = await bcrypt.compare('Password123', u.passwordHash!);
  console.log('plk@gmail.com + Password123 matches:', check);

  await mongoose.disconnect();
}

run().catch(console.error);
