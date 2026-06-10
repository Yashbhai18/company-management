import { Request, Response } from 'express';
import { Holiday } from '../models/Holiday';
import { TimeOffRequest } from '../models/TimeOffRequest';
import type { TokenPayload } from '../utils/token';
import mongoose from 'mongoose';
import { notificationService } from '../services/notification.service';
import { User } from '../models/User';

/** Admins only: Create a holiday */
export const createHoliday = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    if (authed.role === 'employee') {
      return res.status(403).json({ message: 'Forbidden: Admins only.' });
    }

    const { type, targetUserIds, startDate, endDate, description } = req.body;

    if (!type || !startDate || !endDate || !description) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: 'End date cannot be before start date.' });
    }

    const holiday = await Holiday.create({
      orgId: new mongoose.Types.ObjectId(authed.orgId),
      type,
      targetUserIds: targetUserIds && Array.isArray(targetUserIds) 
        ? targetUserIds.map((id: string) => new mongoose.Types.ObjectId(id)) 
        : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      description,
    });

    return res.status(201).json({ success: true, holiday });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** List all holidays relevant to the current authenticated user */
export const listHolidays = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const query: any = { orgId: new mongoose.Types.ObjectId(authed.orgId) };

    // If employee, filter to only 'whole_org' OR their individual holiday
    if (authed.role === 'employee') {
      query.$or = [
        { type: 'whole_org' },
        { type: 'individual', targetUserIds: new mongoose.Types.ObjectId(authed.userId) }
      ];
    }

    const holidays = await Holiday.find(query)
      .populate('targetUserIds', 'name email avatar')
      .sort({ startDate: -1 });
      
    return res.json({ holidays });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Employees only: Submit a custom time off request */
export const requestTimeOff = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: 'End date cannot be before start date.' });
    }

    const newRequest = await TimeOffRequest.create({
      userId: new mongoose.Types.ObjectId(authed.userId),
      orgId: new mongoose.Types.ObjectId(authed.orgId),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status: 'pending',
    });

    // Async notification for admins
    try {
      const applicant = await User.findById(authed.userId);
      const name = applicant ? applicant.name : 'An employee';
      await notificationService.notifyAdmins(authed.orgId, {
        type: 'time_off_request',
        title: 'New Time Off Request',
        message: `${name} requested time off.`,
        actionUrl: '/time-off'
      });
    } catch (notifErr) {
      console.error('Failed to dispatch time off notification:', notifErr);
    }

    return res.status(201).json({ success: true, request: newRequest });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Employees only: List self past requests */
export const listMyRequests = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    const requests = await TimeOffRequest.find({
      userId: new mongoose.Types.ObjectId(authed.userId)
    }).sort({ createdAt: -1 });
    
    return res.json({ requests });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Admins only: List all time off requests in organization */
export const listAllRequests = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    if (authed.role === 'employee') {
      return res.status(403).json({ message: 'Forbidden: Admins only.' });
    }

    const requests = await TimeOffRequest.find({
      orgId: new mongoose.Types.ObjectId(authed.orgId)
    })
      .populate('userId', 'name email avatar')
      .sort({ createdAt: -1 });

    const pendingCount = await TimeOffRequest.countDocuments({
      orgId: new mongoose.Types.ObjectId(authed.orgId),
      status: 'pending'
    });
    
    return res.json({ requests, pendingCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Admins only: Approve/Reject request */
export const reviewRequest = async (req: Request, res: Response) => {
  try {
    const authed = (req as any).user as TokenPayload;
    if (authed.role === 'employee') {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const { requestId } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status payload.' });
    }

    const request = await TimeOffRequest.findOne({
      _id: new mongoose.Types.ObjectId(requestId as string),
      orgId: new mongoose.Types.ObjectId(authed.orgId)
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    request.status = status;
    request.reviewedAt = new Date();
    request.reviewedBy = new mongoose.Types.ObjectId(authed.userId);
    await request.save();

    // Async notification for requester
    try {
      const statusWord = status === 'approved' ? 'approved' : 'rejected';
      await notificationService.createNotification({
        userId: request.userId,
        orgId: request.orgId,
        type: 'time_off_status',
        title: `Time Off Request ${statusWord.charAt(0).toUpperCase() + statusWord.slice(1)}`,
        message: `Your time off request has been ${statusWord} by an administrator.`,
        actionUrl: '/time-off'
      });
    } catch (notifErr) {
      console.error('Failed to dispatch time off review notification:', notifErr);
    }

    return res.json({ success: true, request });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
