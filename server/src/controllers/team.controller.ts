import { Request, Response } from 'express';
import { Team } from '../models/Team';
import { User } from '../models/User';
import type { TokenPayload } from '../utils/token';

/** GET /api/teams — List all teams in the org */
export const getTeams = async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = (req as any).user as TokenPayload;
    
    let query: any = { orgId };
    if (role === 'employee') {
      query.members = userId;
    }

    const teams = await Team.find(query)
      .populate('members', '_id name username avatar role')
      .sort({ createdAt: -1 });

    return res.json(teams);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** POST /api/teams — Admin creates a new group team */
export const createTeam = async (req: Request, res: Response) => {
  try {
    const { orgId, role } = (req as any).user as TokenPayload;
    
    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ message: 'Forbidden: Administrative access required to manage teams.' });
    }

    const { name, members } = req.body;

    if (!name || !members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ message: 'Team name and at least one member list are required.' });
    }

    // Validate that all listed members belong to this organization and are active!
    const validMembers = await User.countDocuments({
      _id: { $in: members },
      orgId,
      isActive: true
    });

    if (validMembers !== members.length) {
      return res.status(400).json({ message: 'Invalid members list: ensure all selected employees belong to this workspace.' });
    }

    const newTeam = await Team.create({
      orgId,
      name,
      members
    });

    const populated = await newTeam.populate('members', '_id name username avatar role');
    return res.status(201).json(populated);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** DELETE /api/teams/:id — Purge team bundle */
export const deleteTeam = async (req: Request, res: Response) => {
  try {
    const { orgId, role } = (req as any).user as TokenPayload;
    const { id } = req.params;

    if (role !== 'admin' && role !== 'super_admin') {
      return res.status(403).json({ message: 'Access Denied' });
    }

    const dropped = await Team.findOneAndDelete({ _id: id, orgId });
    if (!dropped) {
      return res.status(404).json({ message: 'Team not found in this workspace.' });
    }

    return res.json({ message: 'Team removed successfully.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
