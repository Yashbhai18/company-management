import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SLACK_SIGNING_SECRET } from '../config/env';

const SLACK_VERSION = 'v0';
const MAX_AGE_SECONDS = 300; // Reject events older than 5 minutes

/**
 * Verify that an incoming HTTP request is genuinely from Slack
 * by validating the HMAC-SHA256 signature in the X-Slack-Signature header.
 *
 * Slack documentation: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!signature || !timestamp) {
    res.status(401).json({ error: 'Missing Slack signature headers' });
    return;
  }

  // Replay attack prevention
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > MAX_AGE_SECONDS) {
    res.status(401).json({ error: 'Slack request timestamp is too old' });
    return;
  }

  if (!SLACK_SIGNING_SECRET) {
    // In development with no signing secret configured, allow through with a warning
    console.warn('[slack] SLACK_SIGNING_SECRET not set — skipping signature verification (development only)');
    next();
    return;
  }

  // Compute expected signature
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const bodyStr = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body);
  const baseString = `${SLACK_VERSION}:${timestamp}:${bodyStr}`;
  const expected = `${SLACK_VERSION}=` + crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(baseString)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    res.status(401).json({ error: 'Invalid Slack signature' });
    return;
  }

  next();
}
