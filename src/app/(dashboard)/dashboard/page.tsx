"use client";
import React from 'react';
import Link from 'next/link';
import api from '../../../lib/api';
import styles from './page.module.css';

export default function DashboardPage() {
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeShift, setActiveShift] = React.useState<any>(null);
  const [stats, setStats] = React.useState<any>(null);
  const [myOrgs, setMyOrgs] = React.useState<any[]>([]);
  const [myRequests, setMyRequests] = React.useState<any[]>([]);
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [leaveData, setLeaveData] = React.useState<any>(null);
  const [recentShifts, setRecentShifts] = React.useState<any[]>([]);

  // Localized Stopwatch State enabling ticking timers for active shifts
  const [tickerTime, setTickerTime] = React.useState(new Date());

  React.useEffect(() => {
    // Tick continuously to update UI stopwatch every 1s ONLY if shift is active
    if (!activeShift) return;
    
    setTickerTime(new Date());
    const timer = setInterval(() => {
      setTickerTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [activeShift]);

  // Centralized Data Fetcher stored in callback for continuous synchronization
  const fetchData = React.useCallback(async () => {
    try {
      const [uResp, sResp, statResp, oResp, reqResp] = await Promise.all([
        api.get('/auth/me'),
        api.get('/timesheets/active'),
        api.get('/users/stats'),
        api.get('/auth/my-orgs'),
        api.get('/auth/my-join-requests')
      ]);
      const currentUser = uResp.data.user;
      setUser(currentUser);
      setOrg(uResp.data.org);
      setActiveShift(sResp.data.active);
      setStats(statResp.data);
      setMyOrgs(oResp.data.orgs || []);
      setMyRequests(reqResp.data.requests || []);

      // Fetch tasks, leave requests, and timesheet history in parallel
      const [tResp, lResp, histResp] = await Promise.all([
        api.get('/tasks').catch(() => ({ data: [] })),
        api.get(currentUser.role === 'employee' ? '/time-off/my-requests' : '/time-off/all-requests').catch(() => ({ data: { requests: [], pendingCount: 0 } })),
        api.get('/timesheets').catch(() => ({ data: { entries: [] } }))
      ]);
      setTasks(tResp.data || []);
      setLeaveData(lResp.data || null);
      setRecentShifts(histResp.data?.entries || []);
    } catch (err) {
      console.error('Dashboard sync error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Primary Fetch Lifecycle
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // CONTINUOUS INSTANT REFRESH ENGINE: Background updates every 6 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Listen for global status triggers to force real-time synchronous refetches immediately!
  React.useEffect(() => {
    const onStatusChange = () => fetchData();
    window.addEventListener('global-shift-status-changed', onStatusChange);
    return () => window.removeEventListener('global-shift-status-changed', onStatusChange);
  }, [fetchData]);

  const getActiveDurationString = () => {
    if (!activeShift) return '00:00:00';
    const start = new Date(activeShift.clockIn);
    const diff = tickerTime.getTime() - start.getTime();
    if (diff < 0) return '00:00:00';
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getWeeklyHours = () => {
    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeeksEntries = recentShifts.filter((entry: any) => {
      return new Date(entry.clockIn) >= startOfWeek;
    });

    let totalMinutes = thisWeeksEntries.reduce((sum: number, entry: any) => {
      if (entry.durationMinutes) {
        return sum + entry.durationMinutes;
      }
      if (!entry.clockOut) {
        const elapsed = Math.floor((tickerTime.getTime() - new Date(entry.clockIn).getTime()) / 60000);
        return sum + Math.max(0, elapsed);
      }
      return sum;
    }, 0);

    const hrs = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hrs}h ${mins}m`;
  };

  const renderEmployeeDashboard = () => {
    const activeTasks = tasks.filter((t: any) => t.status !== 'completed' && t.status !== 'done');
    
    const completedMinsToday = stats?.personalMinsToday || 0;
    const activeMins = activeShift ? Math.floor((tickerTime.getTime() - new Date(activeShift.clockIn).getTime()) / 60000) : 0;
    const totalMinsToday = completedMinsToday + activeMins;
    const todayHrs = Math.floor(totalMinsToday / 60);
    const todayMins = Math.floor(totalMinsToday % 60);

    const shiftStatusText = activeShift ? 'Clocked In' : 'Clocked Out';
    const weeklyHoursStr = getWeeklyHours();

    return (
      <div className={styles.pageContainer}>
        {/* Welcome Header */}
        <div className={styles.employeeHeader}>
          <div>
            <span className={styles.eyebrow}>Personal Workspace</span>
            <h1 className={styles.title}>Welcome back, {user?.name || 'Employee'}</h1>
          </div>
          <div className={styles.dateText}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Personal KPI Row */}
        <div className={styles.kpiGrid}>
          <div className={`${styles.kpiCard} ${activeShift ? styles.kpiActiveShiftCard : ''}`}>
            <span className={styles.kpiLabel}>Shift Status</span>
            <span className={styles.kpiValue}>
              {shiftStatusText}
              {activeShift && <span className={styles.pulseDot}></span>}
            </span>
            {activeShift ? (
              <span className={styles.kpiSubtext}>
                Started at {new Date(activeShift.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span className={styles.kpiSubtext}>Ready to clock in</span>
            )}
          </div>
          
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Today's Timecard</span>
            <span className={styles.kpiValue}>
              {activeShift ? getActiveDurationString() : `${todayHrs}h ${todayMins}m`}
            </span>
            <span className={styles.kpiSubtext}>Active session duration</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>This Week's Hours</span>
            <span className={styles.kpiValue}>{weeklyHoursStr}</span>
            <span className={styles.kpiSubtext}>Weekly cumulative</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>My Open Tasks</span>
            <span className={styles.kpiValue}>{activeTasks.length}</span>
            <span className={styles.kpiSubtext}>Awaiting completion</span>
          </div>
        </div>

        {/* Row 2: Personal Tasks vs Recent Shifts */}
        <div className={styles.analyticsGrid}>
          
          {/* My Tasks Section */}
          <div className={styles.analyticsCard}>
            <div className={styles.cardHeaderRow}>
              <h3 className={styles.cardSectionTitle}>My Active Assignments</h3>
              <Link href="/tasks" className={styles.viewAllLink}>View All Tasks →</Link>
            </div>
            
            <div className={styles.taskListContainer}>
              {activeTasks.length === 0 ? (
                <div className={styles.emptyContainer}>
                  <p className={styles.emptyText}>You're all caught up! No active tasks assigned.</p>
                </div>
              ) : (
                <div className={styles.dashboardTaskList}>
                  {activeTasks.slice(0, 5).map((task: any) => {
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <div key={task._id} className={styles.dashboardTaskItem}>
                        <div className={styles.taskInfo}>
                          <span className={styles.taskTitleText}>{task.title}</span>
                          <span className={styles.taskDescText}>{task.description || 'No description provided.'}</span>
                          {task.dueDate && (
                            <span className={`${styles.taskDueText} ${isOverdue ? styles.overdueText : ''}`}>
                              Due: {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {isOverdue && '(Overdue)'}
                            </span>
                          )}
                        </div>
                        <span className={`${styles.taskBadge} ${styles['status_' + task.status]}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent Shifts Section */}
          <div className={styles.analyticsCard}>
            <div className={styles.cardHeaderRow}>
              <h3 className={styles.cardSectionTitle}>Recent Timecard Logs</h3>
              <Link href="/timesheets" className={styles.viewAllLink}>Full Timesheet →</Link>
            </div>
            
            <div className={styles.shiftsListContainer}>
              {recentShifts.length === 0 ? (
                <div className={styles.emptyContainer}>
                  <p className={styles.emptyText}>No shifts logged in this period.</p>
                </div>
              ) : (
                <div className={styles.dashboardShiftsList}>
                  {recentShifts.slice(0, 5).map((entry: any) => {
                    const dateStr = new Date(entry.clockIn).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const clockInStr = new Date(entry.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const clockOutStr = entry.clockOut 
                      ? new Date(entry.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      : 'Active Now';
                    
                    const durationStr = entry.durationMinutes !== undefined 
                      ? `${Math.floor(entry.durationMinutes / 60)}h ${entry.durationMinutes % 60}m`
                      : 'Ticking...';

                    return (
                      <div key={entry._id} className={styles.dashboardShiftRow}>
                        <div className={styles.shiftMeta}>
                          <span className={styles.shiftDate}>{dateStr}</span>
                          <span className={styles.shiftHours}>{clockInStr} – {clockOutStr}</span>
                        </div>
                        <div className={styles.shiftDetails}>
                          <span className={`${styles.locationTag} ${entry.locationStatus === 'on-site' ? styles.tagOnSite : styles.tagWfh}`}>
                            {entry.locationStatus === 'on-site' ? 'On-site' : 'WFH'}
                          </span>
                          <span className={styles.shiftDuration}>{durationStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Row 3: My Leave Requests */}
        <div className={styles.projectMatrixCard}>
          <div className={styles.cardHeaderRow}>
            <h3 className={styles.cardSectionTitle}>My Leave Requests</h3>
            <Link href="/time-off" className={styles.viewAllLink}>Request Time Off →</Link>
          </div>
          
          <div className={styles.leavesListContainer}>
            {(!leaveData?.requests || leaveData.requests.length === 0) ? (
              <div className={styles.emptyContainer}>
                <p className={styles.emptyText}>No leave requests recorded yet.</p>
              </div>
            ) : (
              <div className={styles.dashboardLeavesGrid}>
                {leaveData.requests.slice(0, 3).map((req: any) => {
                  const startDateStr = new Date(req.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const endDateStr = new Date(req.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  
                  return (
                    <div key={req._id} className={styles.dashboardLeaveCard}>
                      <div className={styles.leaveHeader}>
                        <span className={styles.leaveType}>{req.type.replace('_', ' ')}</span>
                        <span className={`${styles.statusBadge} ${styles['status_' + req.status]}`}>
                          {req.status}
                        </span>
                      </div>
                      <div className={styles.leaveDates}>
                        {startDateStr} – {endDateStr}
                      </div>
                      {req.reason && <div className={styles.leaveReason}>"{req.reason}"</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <div className={styles.loader}></div>
      </div>
    );
  }

  // Branch here: If role is employee, render the new personalized view!
  if (user?.role === 'employee') {
    return renderEmployeeDashboard();
  }

  // Determine KPI metrics dynamically with fallback to user mockup
  const presentCount = stats?.totalPresent !== undefined 
    ? stats.totalPresent 
    : (activeShift ? 1 : 0);
  
  const displayPresent = stats?.totalPresent !== undefined 
    ? `${stats.totalPresent} Employee${stats.totalPresent !== 1 ? 's' : ''}` 
    : (activeShift ? '1 Employee' : '42 Employees');

  const displayAbsent = stats?.roster 
    ? `${Math.max(0, stats.roster.length - (stats.totalPresent || 0))} Employee${(stats.roster.length - (stats.totalPresent || 0)) !== 1 ? 's' : ''}` 
    : '3 Employees';

  const activeTasksCount = tasks.filter((t: any) => t.status !== 'completed' && t.status !== 'done').length;
  const displayTasks = activeTasksCount > 0 
    ? `${activeTasksCount} Assignment${activeTasksCount !== 1 ? 's' : ''}` 
    : '18 Assignments';

  const pendingLeavesCount = leaveData?.pendingCount !== undefined 
    ? leaveData.pendingCount 
    : (leaveData?.requests?.filter((r: any) => r.status === 'pending').length || 0);
  
  const displayLeaves = pendingLeavesCount > 0 
    ? `${pendingLeavesCount} Awaiting Review` 
    : '4 Awaiting Review';

  // Compile recent activities dynamically
  const activities: any[] = [];
  
  // 1. Clock-in and clock-out events from recent shifts
  recentShifts.forEach((entry: any) => {
    const userName = entry.userId?.name || 'Employee';
    if (entry.clockIn) {
      const clockInDate = new Date(entry.clockIn);
      activities.push({
        rawTime: clockInDate,
        time: clockInDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        user: userName,
        action: `clocked in (${entry.locationStatus === 'on-site' ? 'On-site' : 'WFH'})`
      });
    }
    if (entry.clockOut) {
      const clockOutDate = new Date(entry.clockOut);
      activities.push({
        rawTime: clockOutDate,
        time: clockOutDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        user: userName,
        action: `clocked out`
      });
    }
  });

  // 2. Completed tasks
  const completedTasks = tasks.filter((t: any) => t.status === 'completed' || t.status === 'done');
  completedTasks.forEach((t: any) => {
    const taskDate = t.completedAt ? new Date(t.completedAt) : (t.updatedAt ? new Date(t.updatedAt) : new Date());
    activities.push({
      rawTime: taskDate,
      time: taskDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      user: t.assignedTo?.name || 'Employee',
      action: `completed task "${t.title}"`
    });
  });

  // 3. Leave requests
  if (leaveData?.requests && Array.isArray(leaveData.requests)) {
    leaveData.requests.forEach((req: any) => {
      if (req.createdAt) {
        const reqDate = new Date(req.createdAt);
        activities.push({
          rawTime: reqDate,
          time: reqDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          user: req.userId?.name || 'Employee',
          action: `requested leave (${req.status})`
        });
      }
    });
  }

  // Sort activities chronologically (descending: newest first)
  activities.sort((a, b) => b.rawTime.getTime() - a.rawTime.getTime());

  return (
    <div className={styles.pageContainer}>
      
      {/* Title / Eyebrow Header */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Workspace Overview</span>
          <h1 className={styles.title}>Dashboard</h1>
        </div>
        <div className={styles.dateText}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Present</span>
          <span className={styles.kpiValue}>{displayPresent}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Absent</span>
          <span className={styles.kpiValue}>{displayAbsent}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Active Tasks</span>
          <span className={styles.kpiValue}>{displayTasks}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Leave Requests</span>
          <span className={styles.kpiValue}>{displayLeaves}</span>
        </div>
      </div>

      {/* Row 2: Analytics Grid & Timeline Split */}
      <div className={styles.analyticsGrid}>
        
        {/* Attendance Analytics Card */}
        <div className={styles.analyticsCard}>
          <h3 className={styles.cardSectionTitle}>Attendance Analytics</h3>
          
          {/* Weekly trends bar representation */}
          <div className={styles.barChartContainer}>
            <span className={styles.chartLabel}>Weekly Attendance Trends</span>
            <div className={styles.barChart}>
              {[
                { day: 'Mon', pct: 92 },
                { day: 'Tue', pct: 95 },
                { day: 'Wed', pct: 88 },
                { day: 'Thu', pct: 96 },
                { day: 'Fri', pct: 91 }
              ].map((item) => (
                <div key={item.day} className={styles.chartBarColumn}>
                  <div 
                    className={styles.chartBarFill} 
                    style={{ height: `${item.pct}%` }} 
                    title={`${item.pct}% Attendance Rate`}
                  />
                  <span className={styles.chartBarLabel}>{item.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* WFH vs On-site progress bar ratio */}
          <div className={styles.distributionContainer}>
            <span className={styles.chartLabel}>WFH (40%) vs. On-site (60%)</span>
            <div className={styles.stackedBar}>
              <div className={styles.stackedFillPrimary} style={{ width: '60%' }} title="On-site: 60%" />
              <div className={styles.stackedFillSecondary} style={{ width: '40%' }} title="WFH: 40%" />
            </div>
            <div className={styles.stackedLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: 'var(--primary)' }}></span>
                <span>On-site (60%)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: '#cbd5e1' }}></span>
                <span>WFH (40%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Timeline Card */}
        <div className={styles.analyticsCard}>
          <h3 className={styles.cardSectionTitle}>Recent Activity Timeline</h3>
          <div className={styles.timeline}>
            {activities.length === 0 ? (
              <div className={styles.emptyContainer}>
                <p className={styles.emptyText}>No recent activity logged.</p>
              </div>
            ) : (
              activities.slice(0, 10).map((act, index) => (
                <div key={index} className={styles.timelineItem}>
                  <span className={styles.timelineTime}>{act.time}</span>
                  <span className={styles.timelineDesc}>
                    <strong>{act.user}</strong> {act.action}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Row 3: Project Matrix Overview */}
      <div className={styles.projectMatrixCard}>
        <h3 className={styles.cardSectionTitle}>Project Matrix Overview</h3>
        <div className={styles.projectRowGrid}>
          {[
            { name: 'Project A (Workforce Portal)', pct: 75 },
            { name: 'Project B (Mobile Attendance)', pct: 30 },
            { name: 'Project C (Payroll Integration)', pct: 50 }
          ].map((proj) => (
            <div key={proj.name} className={styles.projectItem}>
              <div className={styles.projectNameRow}>
                <span>{proj.name}</span>
                <span>{proj.pct}%</span>
              </div>
              <div className={styles.projectBarTrack}>
                <div 
                  className={styles.projectBarFill} 
                  style={{ width: `${proj.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
