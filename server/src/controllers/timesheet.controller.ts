import { Request, Response } from 'express';
import { eachDayOfInterval, endOfMonth, format, isWeekend, startOfMonth } from 'date-fns';
import { TimeEntry } from '../models/TimeEntry';
import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { getDistance } from '../utils/geo';
import type { TokenPayload } from '../utils/token';

const BASE_MONTHLY_SALARY = 10000;

const parseMonthRange = (month?: unknown) => {
  const monthString = typeof month === 'string' ? month : '';
  const match = /^(\d{4})-(\d{2})$/.exec(monthString);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  const start = startOfMonth(new Date(year, monthIndex, 1));
  const end = endOfMonth(start);

  return {
    start,
    end,
    monthKey: format(start, 'yyyy-MM'),
  };
};

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildSalarySheet = async (userId: string, orgId: string, month?: unknown, customSalary?: number) => {
  const { start, end, monthKey } = parseMonthRange(month);

  const employee = await User.findOne({ _id: userId, orgId }).select('_id name email avatar role orgId baseSalary');
  if (!employee) {
    const error = new Error('Employee not found in this organization');
    (error as any).status = 404;
    throw error;
  }

  const baseSalary = (customSalary !== undefined && !isNaN(customSalary) && customSalary >= 0) ? customSalary : (employee.baseSalary ?? BASE_MONTHLY_SALARY);

  const [timeEntries, allDays] = await Promise.all([
    TimeEntry.find({
      userId: employee._id,
      orgId,
      clockIn: { $gte: start, $lte: end },
      clockOut: { $exists: true },
    }).sort({ clockIn: 1 }),
    Promise.resolve(eachDayOfInterval({ start, end })),
  ]);

  const validWorkingDays = allDays.filter((day) => !isWeekend(day));
  const validWorkingDayCount = validWorkingDays.length;
  const dailyRateRaw = validWorkingDayCount > 0 ? baseSalary / validWorkingDayCount : 0;
  const dailyRate = Number(dailyRateRaw.toFixed(2));

  const entriesByDay = new Map<string, (typeof timeEntries)[number][]>();
  timeEntries.forEach((entry) => {
    const dayKey = toDateKey(entry.clockIn);
    if (!entriesByDay.has(dayKey)) {
      entriesByDay.set(dayKey, []);
    }
    entriesByDay.get(dayKey)!.push(entry);
  });

  const rows = allDays.map((day) => {
    const dayKey = toDateKey(day);
    const isWorkingDay = !isWeekend(day);
    
    const dayEntries = entriesByDay.get(dayKey) || [];
    const totalMinutes = dayEntries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
    const hasValidAttendance = Boolean(isWorkingDay && dayEntries.length > 0);
    
    let attendanceStatus: 'full' | 'half' | 'absent' = 'absent';
    let earned = 0;
    
    if (hasValidAttendance) {
      if (totalMinutes >= 420) { // 7 hours
        attendanceStatus = 'full';
        earned = dailyRate;
      } else {
        attendanceStatus = 'half';
        earned = Number((dailyRate / 2).toFixed(2));
      }
    }

    const firstEntry = dayEntries[0] || null;
    const lastEntry = dayEntries[dayEntries.length - 1] || null;

    return {
      date: dayKey,
      dayName: format(day, 'EEE'),
      isWeekend: !isWorkingDay,
      isWorkingDay,
      hasValidAttendance,
      attendanceStatus,
      clockIn: firstEntry?.clockIn ? firstEntry.clockIn.toISOString() : null,
      clockOut: lastEntry?.clockOut ? lastEntry.clockOut.toISOString() : null,
      earned,
    };
  });

  const totalEarned = Number(rows.reduce((sum, row) => sum + row.earned, 0).toFixed(2));

  return {
    employee: {
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      avatar: employee.avatar,
      role: employee.role,
    },
    month: monthKey,
    baseMonthlySalary: baseSalary,
    totalDaysInMonth: allDays.length,
    totalValidWorkingDays: validWorkingDayCount,
    payableDays: rows.reduce((sum, row) => sum + (row.attendanceStatus === 'full' ? 1 : row.attendanceStatus === 'half' ? 0.5 : 0), 0),
    dailyRate,
    totalSalary: totalEarned,
    rows,
  };
};

const buildSalaryCsv = (sheet: Awaited<ReturnType<typeof buildSalarySheet>>) => {
  const lines = [
    ['Date', 'Day', 'Working Day', 'Attendance Status', 'Clock In', 'Clock Out', 'Daily Rate', 'Earned'],
    ...sheet.rows.map((row) => [
      row.date,
      row.dayName,
      row.isWorkingDay ? 'Yes' : 'No',
      row.isWeekend ? 'Weekend' : row.attendanceStatus === 'full' ? 'Full Day' : row.attendanceStatus === 'half' ? 'Half Day' : 'Absent',
      row.clockIn || '',
      row.clockOut || '',
      row.isWorkingDay ? sheet.dailyRate.toFixed(2) : '0.00',
      row.earned.toFixed(2),
    ]),
    [],
    ['Summary', '', '', '', '', '', '', ''],
    ['Base Monthly Salary', String(sheet.baseMonthlySalary)],
    ['Total Days in Month', String(sheet.totalDaysInMonth)],
    ['Total Valid Working Days', String(sheet.totalValidWorkingDays)],
    ['Payable Days', String(sheet.payableDays)],
    ['Daily Rate', sheet.dailyRate.toFixed(2)],
    ['Total Salary', sheet.totalSalary.toFixed(2)],
  ];

  return lines
    .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
    .join('\n');
};

export const getActiveShift = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    // find most recent open shift
    const active = await TimeEntry.findOne({
      userId: user.userId,
      clockOut: { $exists: false },
    }).sort({ clockIn: -1 });
    
    return res.json({ active });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const clockIn = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    
    // safety block: avoid double clock in
    const openShift = await TimeEntry.findOne({ userId: user.userId, clockOut: { $exists: false } });
    if (openShift) {
      return res.status(400).json({ message: 'You are already clocked in' });
    }

    // Extra safety lock: Disallow super rapid multi-taps (within 5s)
    const recentEntry = await TimeEntry.findOne({
      userId: user.userId,
      createdAt: { $gte: new Date(Date.now() - 5000) }
    });
    if (recentEntry) {
      return res.status(429).json({ message: 'Request throttled. Please wait a moment.' });
    }

    const { latitude, longitude } = req.body;
    
    let locationStatus: 'on-site' | 'wfh' = 'wfh';
    
    if (latitude !== undefined && longitude !== undefined) {
      const org = await Organization.findById(user.orgId);
      if (org && org.locations && org.locations.length > 0) {
        // Check if user is within radius of ANY organization location
        const isWithinRadius = org.locations.some(loc => {
          const dist = getDistance(latitude, longitude, loc.lat, loc.lng);
          return dist <= loc.radius;
        });
        
        if (isWithinRadius) {
          locationStatus = 'on-site';
        }
      }
    }

    const entry = await TimeEntry.create({
      userId: user.userId,
      orgId: user.orgId,
      clockIn: new Date(),
      locationStatus,
      latitude,
      longitude,
    });

    return res.status(201).json({ entry });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const clockOut = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    
    const openShift = await TimeEntry.findOne({ userId: user.userId, clockOut: { $exists: false } });
    if (!openShift) {
      return res.status(400).json({ message: 'No active shift to clock out of' });
    }

    const now = new Date();
    const diffMs = now.getTime() - openShift.clockIn.getTime();
    const minutes = Math.floor(diffMs / (1000 * 60));

    openShift.clockOut = now;
    openShift.durationMinutes = Math.max(0, minutes);
    await openShift.save();

    return res.json({ entry: openShift });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const getHistory = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const { start, end, month, targetUser } = req.query;

    const isAdmin = user.role === 'super_admin' || user.role === 'admin';

    // Default logic: Admin views all, Employee views self
    let query: any = isAdmin ? { orgId: user.orgId } : { userId: user.userId };

    // If user is Admin, explicitly restrict to ONLY TimeEntries belonging to actual employees
    if (isAdmin) {
      const employees = await User.find({ orgId: user.orgId, role: { $in: ['employee', 'admin', 'super_admin'] } }).select('_id');
      const empIds = employees.map(e => e._id);
      query.userId = { $in: empIds };
    }

    // Override: If admin requests one specific person, apply explicit filter
    if (isAdmin && targetUser) {
      query.userId = targetUser;
    }

    if (month) {
      const date = new Date(String(month) + '-01');
      if (!isNaN(date.getTime())) {
        const y = date.getFullYear();
        const m = date.getMonth();
        query.clockIn = {
          $gte: new Date(y, m, 1),
          $lte: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
      }
    } else if (start || end) {
      query.clockIn = {};
      if (start) query.clockIn.$gte = new Date(String(start));
      if (end) {
        const endD = new Date(String(end));
        endD.setHours(23, 59, 59, 999);
        query.clockIn.$lte = endD;
      }
    }

    // Perform final find and conditionally populate user data so Admin can see names
    const entries = await TimeEntry.find(query)
      .populate('userId', 'name email avatar')
      .sort({ clockIn: -1 })
      .limit(200);

    return res.json({ entries });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const getMonthlySalarySheet = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';
    const requestedUserId = typeof req.query.userId === 'string'
      ? req.query.userId
      : typeof req.query.targetUser === 'string'
        ? req.query.targetUser
        : user.userId;
    const targetUserId = isAdmin ? requestedUserId : user.userId;
    const customSalary = req.query.baseSalary ? Number(req.query.baseSalary) : undefined;
    const sheet = await buildSalarySheet(targetUserId, user.orgId, req.query.month, customSalary);

    const formatType = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : '';
    if (formatType === 'csv') {
      const csv = buildSalaryCsv(sheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=salary-sheet-${sheet.employee.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${sheet.month}.csv`
      );
      return res.send(csv);
    }

    return res.json(sheet);
  } catch (err: any) {
    return res.status(err.status || 500).json({ message: err.message });
  }
};
