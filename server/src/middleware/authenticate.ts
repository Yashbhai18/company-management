import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';

/** Verify Bearer JWT from Authorization header and attach payload to req.user */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    (req as any).user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
};
