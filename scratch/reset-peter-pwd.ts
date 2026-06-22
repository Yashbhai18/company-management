import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User } from '../server/src/models/User';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI!;

async function run() {
  const password = process.argv[2];
  if (!password) {
    console.error('Error: Please specify the new password as a command line argument.');
    console.error('Example: ts-node reset-peter-pwd.ts MyNewSecurePassword123!');
    process.exit(1);
  }

  // Validate password strength according to the custom security policy
  if (password.length < 8 || password.length > 12) {
    console.error('Error: Password must be between 8 and 12 characters.');
    process.exit(1);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    console.error('Error: Password must contain uppercase, lowercase, numbers, and special symbols.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const hash = await bcrypt.hash(password, 12);
  const res = await User.updateOne({ email: 'plk@gmail.com' }, { $set: { passwordHash: hash } });
  console.log('Update result:', res);

  await mongoose.disconnect();
}

run().catch(console.error);
