import type { TokenPayload } from '../utils/token';

declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}

export {};
