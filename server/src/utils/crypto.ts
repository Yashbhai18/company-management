import crypto from 'crypto';
import { JWT_SECRET } from '../config/env';

// Derive a 32-byte key from JWT_SECRET for AES-256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest();
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypts cleartext using AES-256-CBC.
 * Returns iv and ciphertext formatted as hex joined by a colon (iv:ciphertext).
 */
export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = cipher.update(text, 'utf8');
  const finalBuffer = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + finalBuffer.toString('hex');
};

/**
 * Decrypts a ciphertext string encrypted with AES-256-CBC.
 * Accepts input in the format (iv:ciphertext).
 */
export const decrypt = (text: string): string => {
  const parts = text.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const decrypted = decipher.update(encryptedText);
  const finalBuffer = Buffer.concat([decrypted, decipher.final()]);
  return finalBuffer.toString('utf8');
};
