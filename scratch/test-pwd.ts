import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from '../server/src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  const password = process.argv[2];
  if (!password) {
    console.error('Error: Please specify the password to test as a command line argument.');
    console.error('Example: ts-node test-pwd.ts MyPassword');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const u = await User.findOne({ email: 'plk@gmail.com' });
  if (!u) {
    console.log('Peter not found');
    process.exit(1);
  }

  const check = await bcrypt.compare(password, u.passwordHash!);
  console.log(`plk@gmail.com + ${password} matches:`, check);

  await mongoose.disconnect();
}

run().catch(console.error);
