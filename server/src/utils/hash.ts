import crypto from 'crypto';

/** Generate a secure refresh token and its SHA-256 hash */
export const generateRefreshToken = (): { raw: string; hashed: string } => {
  const raw = crypto.randomBytes(64).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
};

/** SHA-256 hash of an arbitrary token */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
