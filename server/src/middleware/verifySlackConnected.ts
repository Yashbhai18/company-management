import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import type { TokenPayload } from '../utils/token';

export const verifySlackConnected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userPayload = (req as any).user as TokenPayload | undefined;
    if (!userPayload?.userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const currentUser = await User.findById(userPayload.userId).select('slack').lean();
    if (!currentUser || !currentUser.slack || !currentUser.slack.connected) {
      console.warn(`[verifySlackConnected] 403 – userId: ${userPayload.userId}, hasUser: ${!!currentUser}, hasSlack: ${!!currentUser?.slack}, connected: ${currentUser?.slack?.connected}`);
      return res.status(403).json({
        success: false,
        code: 'SLACK_ACCOUNT_REQUIRED',
        message: 'Connect your Slack account before sending Slack messages.'
      });
    }

    next();
  } catch (err: any) {
    console.error('[verifySlackConnected] Error:', err.message);
    res.status(500).json({ message: err.message || 'Internal server error' });
  }
};
