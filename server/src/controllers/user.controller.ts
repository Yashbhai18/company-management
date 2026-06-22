import { Request, Response } from 'express';
import { User } from '../models/User';
import type { TokenPayload } from '../utils/token';
import { ensureCustomDepartmentSaved } from '../models/Organization';

export const getMembers = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    
    // Conditionally project inviteToken based on admin permissions
    let selectProj = '-passwordHash';
    if (authedUser.role !== 'admin' && authedUser.role !== 'super_admin') {
      selectProj += ' -inviteToken';
    }

    // Fetch all workspace users except the root super_admin node
    const users = await User.find({ 
      orgId: authedUser.orgId,
      role: { $ne: 'super_admin' }
    })
      .select(selectProj)
      .sort({ createdAt: -1 });
      
    return res.json({ users });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const deleteMember = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    const { id } = req.params;

    // Verify administrative privileges
    if (authedUser.role !== 'admin' && authedUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Operation denied. Admin clearance required.' });
    }

    // Prevent self-destruction
    if (authedUser.userId === id) {
      return res.status(400).json({ message: 'You cannot revoke your own membership status.' });
    }

    const member = await User.findOne({ _id: id, orgId: authedUser.orgId });
    if (!member) {
      return res.status(404).json({ message: 'Target member node not found in workspace.' });
    }

    // Purge the record
    await User.deleteOne({ _id: id });
    
    return res.json({ message: 'Member record successfully purged from workspace.' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

import { TimeEntry } from '../models/TimeEntry';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // For Employees: Count their personal duration today
    if (authedUser.role === 'employee') {
      const entries = await TimeEntry.find({
        userId: authedUser.userId,
        clockIn: { $gte: startOfToday, $lte: endOfToday }
      }).sort({ clockIn: -1 });
      const totalMins = entries.reduce((acc, cur) => acc + (cur.durationMinutes || 0), 0);
      return res.json({ 
        personalMinsToday: totalMins,
        todayEntries: entries
      });
    }

    // For Admins: Load only EMPLOYEES and reconcile with current daily active entries
    const allUsers = await User.find({ 
      orgId: authedUser.orgId,
      role: { $in: ['employee', 'admin', 'super_admin'] }
    })
      .select('name email avatar')
      .lean();

    // Get all entries created today OR any currently active (not clocked out) entries
    const todaysEntries = await TimeEntry.find({
      orgId: authedUser.orgId,
      $or: [
        { clockIn: { $gte: startOfToday, $lte: endOfToday } },
        { clockOut: { $exists: false } }
      ]
    }).lean();

    const enrichedRoster = allUsers.map((u: any) => {
      const userEntries = todaysEntries.filter(e => e.userId.toString() === u._id.toString());
      
      let status = 'absent';
      let locationStatus = 'wfh';
      let lastClockIn = null;
      
      const activeShift = userEntries.find(e => !e.clockOut);
      if (activeShift) {
        status = 'clocked_in';
        locationStatus = activeShift.locationStatus || 'wfh';
        lastClockIn = activeShift.clockIn;
      } else if (userEntries.length > 0) {
        status = 'clocked_out';
        const sorted = [...userEntries].sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
        lastClockIn = sorted[0]?.clockIn || null;
      }

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        status,
        locationStatus,
        lastClockIn
      };
    });

    const totalActive = enrichedRoster.filter(r => r.status === 'clocked_in').length;

    return res.json({
      roster: enrichedRoster,
      totalPresent: totalActive
    });

  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateAvatar = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    const { avatar } = req.body;
    
    const currentUser = await User.findById(authedUser.userId);
    if (currentUser && currentUser.email) {
      // Synchronize avatar across ALL active workspaces for this identity!
      await User.updateMany({ email: currentUser.email.toLowerCase() }, { avatar });
    } else {
      await User.findByIdAndUpdate(authedUser.userId, { avatar });
    }
    
    return res.json({ success: true, avatar });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    const { name, username, phone, countryCode, department } = req.body;

    const user = await User.findById(authedUser.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    
    if (username) {
      const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (cleanUsername.length < 2) {
        return res.status(400).json({ message: 'Username must be at least 2 alphanumeric characters.' });
      }

      // Enforce organization-level username uniqueness
      const duplicate = await User.findOne({ 
        orgId: authedUser.orgId, 
        username: cleanUsername, 
        _id: { $ne: authedUser.userId } 
      });
      if (duplicate) {
        return res.status(400).json({ message: 'This username is already claimed by another team member.' });
      }
      user.username = cleanUsername;
    }

    if (phone !== undefined) user.phone = phone;
    if (countryCode !== undefined) user.countryCode = countryCode;
    
    if (department !== undefined) {
      // Only admins/super_admins can alter department
      if (authedUser.role === 'admin' || authedUser.role === 'super_admin') {
        user.department = department;
      } else {
        // If an employee attempts to CHANGE their department, block it.
        if (department !== user.department) {
          return res.status(403).json({ message: 'Only administrators are authorized to modify the department field.' });
        }
      }
    }

    await user.save();

    return res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        countryCode: user.countryCode,
        department: user.department,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const user = await User.findById(authedUser.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if current password is valid
    if (user.comparePassword) {
      const isValid = await user.comparePassword(currentPassword);
      if (!isValid) {
        return res.status(400).json({ message: 'Incorrect current password' });
      }
    } else {
      // Fallback just in case comparePassword is missing from instance methods
      return res.status(500).json({ message: 'Internal security engine unavailable' });
    }

    // Assign new plaintext password to passwordHash, which will trigger the pre('save') hashing hook
    user.passwordHash = newPassword;
    await user.save();

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updateMemberByAdmin = async (req: Request, res: Response) => {
  try {
    const authedUser = (req as any).user as TokenPayload;
    const { id } = req.params;
    const { name, username, email, phone, countryCode, role, department, baseSalary } = req.body;

    if (authedUser.role !== 'admin' && authedUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Admin clearance required.' });
    }

    const userToUpdate = await User.findOne({ _id: id, orgId: authedUser.orgId });
    if (!userToUpdate) {
      return res.status(404).json({ message: 'Member not found in workspace.' });
    }

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Display Name cannot be empty.' });
      userToUpdate.name = name.trim();
    }

    if (username !== undefined) {
      const clean = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (clean) {
        if (clean.length < 2) {
          return res.status(400).json({ message: 'Username must be at least 2 alphanumeric characters.' });
        }
        const duplicate = await User.findOne({ 
          orgId: authedUser.orgId, 
          username: clean, 
          _id: { $ne: id } 
        });
        if (duplicate) {
          return res.status(400).json({ message: 'Username already claimed by another member.' });
        }
        userToUpdate.username = clean;
      } else {
        userToUpdate.username = '';
      }
    }

    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();
      if (!cleanEmail) {
        return res.status(400).json({ message: 'Email address cannot be empty.' });
      }
      const duplicate = await User.findOne({ 
        orgId: authedUser.orgId, 
        email: cleanEmail, 
        _id: { $ne: id } 
      });
      if (duplicate) {
        return res.status(400).json({ message: 'Email address already in use.' });
      }
      userToUpdate.email = cleanEmail;
    }

    if (phone !== undefined) userToUpdate.phone = phone.trim();
    if (countryCode !== undefined) userToUpdate.countryCode = countryCode;

    if (role !== undefined) {
      // Prevent updating own role or system disruption
      if (authedUser.userId !== id && ['employee', 'admin', 'super_admin'].includes(role)) {
        userToUpdate.role = role;
      }
    }

    if (department !== undefined) {
      if (userToUpdate.role === 'employee' && (!department || !department.trim())) {
        return res.status(400).json({ message: 'Department cannot be empty for employees.' });
      }
      userToUpdate.department = department.trim();
      // Persist custom departments in org
      await ensureCustomDepartmentSaved(authedUser.orgId, department);
    }

    if (baseSalary !== undefined) {
      const parsedSalary = Number(baseSalary);
      if (isNaN(parsedSalary) || parsedSalary < 0) {
        return res.status(400).json({ message: 'Base Salary must be a non-negative number.' });
      }
      userToUpdate.baseSalary = parsedSalary;
    }

    if (req.body.weekendSettings !== undefined) {
      userToUpdate.weekendSettings = {
        ...req.body.weekendSettings,
        isConfigured: true
      };
    }

    await userToUpdate.save();
    return res.json({ success: true, user: userToUpdate });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
