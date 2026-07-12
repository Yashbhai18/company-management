import { Request, Response } from 'express';
import { getDashboardMetrics } from '../services/dashboard.service';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.orgId;
    // Extract user timezone offset from query if passed, else default to 0
    let tzOffset = 0;
    if (req.query.tzOffset) {
      tzOffset = parseInt(req.query.tzOffset as string, 10);
    }
    
    if (!orgId) {
      return res.status(400).json({ message: 'Organization ID is missing.' });
    }

    const data = await getDashboardMetrics(orgId.toString(), tzOffset);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[DashboardController] Error fetching metrics:', error);
    return res.status(500).json({ message: 'Failed to load dashboard data', error: error.message });
  }
};
