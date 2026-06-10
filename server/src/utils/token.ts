import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env';

/** Token payload exposed in access tokens */
export interface TokenPayload {
  userId: string;
  orgId: string;
  role: 'super_admin' | 'admin' | 'employee';
}

/** Generate a signed JWT access token */
export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'jibble-clone',
  } as jwt.SignOptions);
};

/** Verify and return token payload */
export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET as jwt.Secret) as TokenPayload;
};

/** Payload for short-lived 2FA login verification token */
export interface Temp2faPayload {
  userId: string;
  pendingSessionId: string;
  isTemp2fa: true;
}

/** Generate a temporary 2FA verification JWT token valid for 5 minutes */
export const generateTemp2faToken = (payload: Temp2faPayload): string => {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, {
    expiresIn: '5m',
    issuer: 'jibble-clone-2fa',
  });
};

/** Verify a temporary 2FA verification token */
export const verifyTemp2faToken = (token: string): Temp2faPayload => {
  const payload = jwt.verify(token, JWT_SECRET as jwt.Secret) as any;
  if (payload.isTemp2fa !== true) {
    throw new Error('Invalid temporary token type');
  }
  return payload;
};
