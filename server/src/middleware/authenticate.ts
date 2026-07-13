import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';

/** Verify Bearer JWT from Authorization header and attach payload to req.user */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  let token = '';
  
  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    // Fallback to cookie for native browser requests (img src, video src, direct links)
    token = req.cookies.accessToken;
  } else if (req.query && req.query.token) {
    // Fallback to query param for cross-origin native browser requests
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    (req as any).user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
};
