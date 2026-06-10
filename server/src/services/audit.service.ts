import { AuditLog } from '../models/AuditLog';
import mongoose from 'mongoose';

export const auditService = {
  /**
   * Logs a security action to the audit log collection.
   */
  log: async (params: {
    userId?: string | mongoose.Types.ObjectId;
    action: string;
    details: string;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    try {
      await AuditLog.create({
        userId: params.userId ? new mongoose.Types.ObjectId(params.userId as string) : undefined,
        action: params.action,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
    } catch (err) {
      // Fail silently for audit logs to not interrupt main application flows, but log to server console
      console.error('Failed to create audit log entry:', err);
    }
  }
};
