import crypto from 'crypto';
import { SLACK_TOKEN_ENCRYPTION_KEY } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = SLACK_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // Fallback for development with no key configured — not secure for production
    return Buffer.alloc(32, 0);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext Slack token using AES-256-GCM.
 * Returns a string in the format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = (cipher as any).getAuthTag() as Buffer;
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypt a token produced by `encryptToken()`.
 * Returns the original plaintext or throws if the data has been tampered with.
 */
export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid Slack token ciphertext format');
  const [ivHex, tagHex, dataHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  (decipher as any).setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Returns true if the value looks like an AES-256-GCM encrypted ciphertext (3 hex segments). */
export function isEncryptedToken(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
