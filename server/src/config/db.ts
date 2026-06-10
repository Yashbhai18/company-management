import mongoose from 'mongoose';
import { MONGODB_URI } from './env';

/** Connects to MongoDB with retries and helpful logging */
export const connectDB = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set');
  try {
    await mongoose.connect(MONGODB_URI, {
      autoIndex: true,
    } as mongoose.ConnectOptions);
    console.info('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    // retry once after short delay then rethrow
    await new Promise((r) => setTimeout(r, 2000));
    await mongoose.connect(MONGODB_URI);
  }
};
