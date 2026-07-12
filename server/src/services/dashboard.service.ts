import mongoose from 'mongoose';
import { User } from '../models/User';
import { TimeEntry } from '../models/TimeEntry';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { TimeOffRequest } from '../models/TimeOffRequest';
import { AuditLog } from '../models/AuditLog';
import { SlackWorkspace } from '../models/SlackWorkspace';
import { SlackChannel } from '../models/SlackChannel';
import { SlackUser } from '../models/SlackUser';

export async function getDashboardMetrics(orgId: string, timezoneOffsetMins: number = 0) {
  const orgObjectId = new mongoose.Types.ObjectId(orgId);
  
  // Define "today" boundaries
  const now = new Date();
  // Adjust for user timezone to get start of their day
  const todayStart = new Date(now);
  todayStart.setMinutes(todayStart.getMinutes() - timezoneOffsetMins);
  todayStart.setHours(0, 0, 0, 0);
  todayStart.setMinutes(todayStart.getMinutes() + timezoneOffsetMins);

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // 1. Employees Online (checked in today, no checkout)
  const onlineCountPromise = TimeEntry.countDocuments({
    orgId: orgObjectId,
    clockIn: { $gte: todayStart, $lt: todayEnd },
    clockOut: null,
  });

  // 2. Today's Attendance Stats (Present, WFH, Late, Absent)
  // We'll define "Late" as checking in after 09:15 AM local time
  const lateThreshold = new Date(todayStart);
  lateThreshold.setHours(9, 15, 0, 0);

  const todayAttendancePromise = TimeEntry.aggregate([
    { $match: { orgId: orgObjectId, clockIn: { $gte: todayStart, $lt: todayEnd } } },
    {
      $group: {
        _id: '$userId',
        firstClockIn: { $min: '$clockIn' },
        locationStatus: { $first: '$locationStatus' },
      }
    }
  ]);

  // Total Active Employees for Absent calculation
  const totalEmployeesPromise = User.countDocuments({
    orgId: orgObjectId,
    isActive: true,
  });

  // 3. Active Tasks
  const activeTasksPromise = Task.countDocuments({
    orgId: orgObjectId,
    status: { $nin: ['Completed', 'Done', 'Archived'] }
  });

  // Tasks Due Today
  const tasksDueTodayPromise = Task.countDocuments({
    orgId: orgObjectId,
    dueDate: { $gte: todayStart, $lt: todayEnd },
    status: { $nin: ['Completed', 'Done', 'Archived'] }
  });
  
  // Overdue Tasks
  const overdueTasksPromise = Task.countDocuments({
    orgId: orgObjectId,
    dueDate: { $lt: todayStart },
    status: { $nin: ['Completed', 'Done', 'Archived'] }
  });

  // 4. Leave Requests
  const pendingLeavePromise = TimeOffRequest.countDocuments({
    orgId: orgObjectId,
    status: 'pending'
  });

  // Employees on leave today
  const onLeaveTodayPromise = TimeOffRequest.countDocuments({
    orgId: orgObjectId,
    status: 'approved',
    startDate: { $lte: todayEnd },
    endDate: { $gte: todayStart }
  });

  // 5. Project Matrix
  const projectsPromise = Project.aggregate([
    { $match: { orgId: orgObjectId, status: { $ne: 'archived' } } },
    {
      $lookup: {
        from: 'tasks',
        localField: '_id',
        foreignField: 'projectId',
        as: 'tasks'
      }
    },
    {
      $project: {
        name: 1,
        dueDate: 1,
        totalTasks: { $size: '$tasks' },
        completedTasks: {
          $size: {
            $filter: {
              input: '$tasks',
              as: 'task',
              cond: { $in: ['$$task.status', ['Completed', 'Done']] }
            }
          }
        }
      }
    },
    {
      $addFields: {
        progress: {
          $cond: [
            { $eq: ['$totalTasks', 0] },
            0,
            { $round: [{ $multiply: [{ $divide: ['$completedTasks', '$totalTasks'] }, 100] }, 0] }
          ]
        }
      }
    },
    { $limit: 5 }
  ]);

  // 6. Recent Activity
  const auditLogsPromise = AuditLog.aggregate([
    { $match: { action: { $ne: 'api_request' } } }, // exclude routine if any
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 1,
        action: 1,
        details: 1,
        createdAt: 1,
        user: { name: 1, avatar: 1 }
      }
    }
  ]);

  // 7. Upcoming Birthdays (Next 7 days)
  const nextWeek = new Date(todayStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  const upcomingBirthdaysPromise = User.aggregate([
    { $match: { orgId: orgObjectId, isActive: true, dob: { $ne: null } } },
    {
      $addFields: {
        nextBirthday: {
          $dateFromParts: {
            year: { $year: todayStart },
            month: { $month: '$dob' },
            day: { $dayOfMonth: '$dob' }
          }
        }
      }
    },
    {
      $addFields: {
        nextBirthday: {
          $cond: [
            { $lt: ['$nextBirthday', todayStart] },
            {
              $dateFromParts: {
                year: { $add: [{ $year: todayStart }, 1] },
                month: { $month: '$dob' },
                day: { $dayOfMonth: '$dob' }
              }
            },
            '$nextBirthday'
          ]
        }
      }
    },
    { $match: { nextBirthday: { $lte: nextWeek } } },
    { $sort: { nextBirthday: 1 } },
    { $project: { name: 1, avatar: 1, dob: 1, nextBirthday: 1 } }
  ]);

  // 8. Upcoming Work Anniversaries (Next 30 days)
  const nextMonth = new Date(todayStart);
  nextMonth.setDate(nextMonth.getDate() + 30);

  const upcomingAnniversariesPromise = User.aggregate([
    { $match: { orgId: orgObjectId, isActive: true, dateOfJoining: { $ne: null } } },
    {
      $addFields: {
        nextAnniversary: {
          $dateFromParts: {
            year: { $year: todayStart },
            month: { $month: '$dateOfJoining' },
            day: { $dayOfMonth: '$dateOfJoining' }
          }
        }
      }
    },
    {
      $addFields: {
        nextAnniversary: {
          $cond: [
            { $lt: ['$nextAnniversary', todayStart] },
            {
              $dateFromParts: {
                year: { $add: [{ $year: todayStart }, 1] },
                month: { $month: '$dateOfJoining' },
                day: { $dayOfMonth: '$dateOfJoining' }
              }
            },
            '$nextAnniversary'
          ]
        }
      }
    },
    { $match: { nextAnniversary: { $lte: nextMonth } } },
    {
      $addFields: {
        yearsCompleted: {
          $subtract: [
            { $year: '$nextAnniversary' },
            { $year: '$dateOfJoining' }
          ]
        }
      }
    },
    { $match: { yearsCompleted: { $gt: 0 } } },
    { $sort: { nextAnniversary: 1 } },
    { $project: { name: 1, avatar: 1, dateOfJoining: 1, nextAnniversary: 1, yearsCompleted: 1 } }
  ]);

  // 9. Department Overview
  const departmentOverviewPromise = User.aggregate([
    { $match: { orgId: orgObjectId, isActive: true, department: { $ne: null } } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  // 10. Slack Workspace Status
  const slackWorkspacePromise = SlackWorkspace.findOne({ orgId: orgObjectId }).lean();
  const slackChannelsCountPromise = SlackChannel.countDocuments({ orgId: orgObjectId, isArchived: false });
  const slackMembersCountPromise = SlackUser.countDocuments({ orgId: orgObjectId, deleted: false });

  // 11. Attendance Heatmap (Last 30 days)
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const heatmapPromise = TimeEntry.aggregate([
    { $match: { orgId: orgObjectId, clockIn: { $gte: thirtyDaysAgo, $lte: todayEnd } } },
    {
      $group: {
        _id: {
          year: { $year: { date: '$clockIn', timezone: 'UTC' } }, // rough grouping, better to use timezone offset but fine for heatmap
          month: { $month: { date: '$clockIn', timezone: 'UTC' } },
          day: { $dayOfMonth: { date: '$clockIn', timezone: 'UTC' } }
        },
        count: { $sum: 1 },
        wfhCount: { $sum: { $cond: [{ $eq: ['$locationStatus', 'wfh'] }, 1, 0] } }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  // Wait for all promises
  const [
    onlineCount,
    todayAttendance,
    totalEmployees,
    activeTasks,
    tasksDueToday,
    overdueTasks,
    pendingLeave,
    onLeaveToday,
    projects,
    auditLogs,
    upcomingBirthdays,
    upcomingAnniversaries,
    departmentOverview,
    slackWorkspace,
    slackChannelsCount,
    slackMembersCount,
    heatmapData
  ] = await Promise.all([
    onlineCountPromise,
    todayAttendancePromise,
    totalEmployeesPromise,
    activeTasksPromise,
    tasksDueTodayPromise,
    overdueTasksPromise,
    pendingLeavePromise,
    onLeaveTodayPromise,
    projectsPromise,
    auditLogsPromise,
    upcomingBirthdaysPromise,
    upcomingAnniversariesPromise,
    departmentOverviewPromise,
    slackWorkspacePromise,
    slackChannelsCountPromise,
    slackMembersCountPromise,
    heatmapPromise
  ]);

  // Calculate Attendance Stats
  let presentCount = 0;
  let wfhCount = 0;
  let lateCount = 0;
  let totalCheckInTime = 0;

  todayAttendance.forEach((entry) => {
    presentCount++;
    if (entry.locationStatus === 'wfh') {
      wfhCount++;
    }
    if (new Date(entry.firstClockIn) > lateThreshold) {
      lateCount++;
    }
    const checkInDate = new Date(entry.firstClockIn);
    const minsSinceMidnight = checkInDate.getHours() * 60 + checkInDate.getMinutes();
    totalCheckInTime += minsSinceMidnight;
  });

  const absentCount = Math.max(0, totalEmployees - presentCount - onLeaveToday);
  
  let avgCheckInTime = null;
  if (presentCount > 0) {
    const avgMins = Math.floor(totalCheckInTime / presentCount);
    const hrs = Math.floor(avgMins / 60);
    const mins = avgMins % 60;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const hrs12 = hrs % 12 || 12;
    avgCheckInTime = `${hrs12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
  }

  // Calculate Payroll Status
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  const employeesWithTimeThisMonth = await TimeEntry.distinct('userId', {
    orgId: orgObjectId,
    clockIn: { $gte: monthStart, $lte: monthEnd }
  });

  let payrollProcessedPct = 0;
  let payrollPendingCount = totalEmployees;
  if (totalEmployees > 0) {
    payrollProcessedPct = Math.round((employeesWithTimeThisMonth.length / totalEmployees) * 100);
    payrollPendingCount = totalEmployees - employeesWithTimeThisMonth.length;
  }

  // Calculate Productivity Score
  const attendancePct = totalEmployees > 0 ? (presentCount / totalEmployees) * 100 : 100;
  let productivityScore = Math.round(attendancePct - (lateCount * 2));
  if (productivityScore < 0) productivityScore = 0;
  if (productivityScore > 100) productivityScore = 100;

  // Format WFH vs On-Site
  const onSiteCount = presentCount - wfhCount;
  const wfhPct = presentCount > 0 ? Math.round((wfhCount / presentCount) * 100) : 0;
  const onSitePct = presentCount > 0 ? Math.round((onSiteCount / presentCount) * 100) : 0;

  // Format Slack Status
  const slackStatus = slackWorkspace ? {
    connected: true,
    lastSync: slackWorkspace.lastSyncedAt || slackWorkspace.createdAt,
    channels: slackChannelsCount,
    members: slackMembersCount,
    dms: 0 
  } : { connected: false };

  // Map Audit logs to recent activity
  const recentActivity = auditLogs.map(log => {
    let actionStr = log.action;
    if (log.action === 'login') actionStr = 'logged in';
    else if (log.action === 'check_in') actionStr = 'checked in';
    else if (log.action === 'check_out') actionStr = 'checked out';
    
    return {
      id: log._id,
      user: log.user ? log.user.name : 'System',
      avatar: log.user ? log.user.avatar : null,
      event: `${log.user ? log.user.name : 'System'} ${actionStr}`,
      time: log.createdAt,
      details: log.details
    };
  });

  // Map Heatmap
  const heatmap = heatmapData.map(d => {
    const dateStr = `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`;
    return {
      date: dateStr,
      count: d.count,
      wfhCount: d.wfhCount
    };
  });

  return {
    topMetrics: {
      presentEmployees: presentCount,
      wfhEmployees: wfhCount,
      lateEmployees: lateCount,
      absentEmployees: absentCount,
      onLeaveEmployees: onLeaveToday,
      activeTasks,
      leaveRequests: pendingLeave,
    },
    wfhVsOnSite: {
      wfh: wfhPct,
      onSite: onSitePct,
    },
    newWidgets: {
      employeesOnline: onlineCount,
      avgCheckInTime,
      lateArrivals: lateCount,
      employeesOnLeave: onLeaveToday,
      tasksDueToday,
      overdueTasks,
    },
    projectsMatrix: projects,
    recentActivity,
    upcomingBirthdays,
    upcomingAnniversaries,
    departmentOverview,
    productivityScore,
    payrollStatus: {
      month: now.toLocaleString('default', { month: 'long' }),
      processedPct: payrollProcessedPct,
      pendingCount: payrollPendingCount,
    },
    slackStatus,
    attendanceHeatmap: heatmap
  };
}
