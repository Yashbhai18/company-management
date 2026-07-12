import { Request, Response } from 'express';
import { Task } from '../models/Task';
import { Holiday } from '../models/Holiday';
import { TimeOffRequest } from '../models/TimeOffRequest';
import { User } from '../models/User';
import type { TokenPayload } from '../utils/token';

export const searchAll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({ tasks: [], holidays: [], timeOff: [], people: [] });
    }

    const queryStr = q.trim();
    if (queryStr.length === 0) {
      return res.json({ tasks: [], holidays: [], timeOff: [], people: [] });
    }

    const regex = new RegExp(queryStr, 'i');

    const [tasks, holidays, timeOffRequests, users] = await Promise.all([
      // 1. Search Tasks (only in org, and if role is employee, only assigned to them)
      Task.find({
        orgId: user.orgId,
        $or: [{ title: regex }, { description: regex }],
        ...(user.role === 'employee' ? { assignedTo: user.userId } : {})
      })
        .limit(5)
        .select('title description status dueDate'),

      // 2. Search Holidays
      Holiday.find({
        orgId: user.orgId,
        description: regex
      })
        .limit(5)
        .select('description startDate endDate type'),

      // 4. Search TimeOffRequests (only in org, if employee only their own)
      TimeOffRequest.find({
        orgId: user.orgId,
        reason: regex,
        ...(user.role === 'employee' ? { userId: user.userId } : {})
      })
        .populate('userId', 'name')
        .limit(5)
        .select('reason startDate endDate status'),

      // 5. Search Users (coworkers)
      User.find({
        orgId: user.orgId,
        $or: [{ name: regex }, { email: regex }],
        role: { $ne: 'super_admin' }
      })
        .limit(5)
        .select('name email role avatar department')
    ]);

    return res.json({
      tasks,
      holidays,
      timeOff: timeOffRequests,
      people: users
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
