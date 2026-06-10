import { Request, Response, NextFunction } from 'express';

type Role = 'super_admin' | 'admin' | 'employee';

/** Middleware to allow only specified roles (scoped per org in token) */
export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role as Role | undefined;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }
    next();
  };
};
