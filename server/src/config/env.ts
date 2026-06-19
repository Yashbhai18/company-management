import 'dotenv/config';
import { z } from 'zod';

/** Zod-validated environment variables */
const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  DEV_JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_FROM: z.string().email().default('no-reply@edihub.in'),
  EMAIL_FROM_NAME: z.string().default('edihub'),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
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
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME;
export const RESEND_API_KEY = env.RESEND_API_KEY;
export const BREVO_API_KEY = env.BREVO_API_KEY;
export const NODE_ENV = env.NODE_ENV;
export const DEV_JWT_SECRET = env.DEV_JWT_SECRET;
