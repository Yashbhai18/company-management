import 'dotenv/config';
import { z } from 'zod';

/** Zod-validated environment variables */
const envSchema = z.object({
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/jibble_clone'),
  JWT_SECRET: z.string().min(32).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_FROM: z.string().email().default('no-reply@jibble-clone.com'),
  RESEND_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().default('4000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with readable errors
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

/** Convenience values */
export const PORT = Number(env.PORT);
export const MONGODB_URI = env.MONGODB_URI;
export const JWT_SECRET = env.JWT_SECRET;
export const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;
export const CLIENT_URL = env.CLIENT_URL;
export const EMAIL_FROM = env.EMAIL_FROM;
export const RESEND_API_KEY = env.RESEND_API_KEY;
export const NODE_ENV = env.NODE_ENV;
