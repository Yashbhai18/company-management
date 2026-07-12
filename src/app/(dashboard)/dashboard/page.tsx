"use client";
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../../../lib/api';
import styles from './page.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const fetchData = React.useCallback(async () => {
    try {
      // Pass local timezone offset so backend knows start of "today"
      const tzOffset = new Date().getTimezoneOffset();
      const res = await api.get(`/dashboard?tzOffset=${tzOffset}`);
      setData(res.data);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        console.error('Dashboard sync error:', err);
        setError('Failed to load dashboard data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time Dashboard Sync Every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className={styles.loaderContainer}>
        <div className={styles.loader}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const {
    topMetrics,
    wfhVsOnSite,
    newWidgets,
    projectsMatrix,
    recentActivity,
    upcomingBirthdays,
    upcomingAnniversaries,
    departmentOverview,
    attendanceHeatmap,
    productivityScore,
    payrollStatus,
    slackStatus
  } = data;

  const renderEmptyState = (message: string) => (
    <div className={styles.emptyState}>{message}</div>
  );

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Workspace Overview</span>
          <h1 className={styles.title}>Dashboard</h1>
        </div>
        <div className={styles.dateText}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Present Today</span>
          <span className={styles.kpiValue}>{topMetrics.presentEmployees}</span>
          <span className={styles.kpiSubtext}>Includes WFH ({topMetrics.wfhEmployees}) & Late ({topMetrics.lateEmployees})</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Absent / Leave</span>
          <span className={styles.kpiValue}>{topMetrics.absentEmployees}</span>
          <span className={styles.kpiSubtext}>{topMetrics.onLeaveEmployees} currently on leave</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Active Tasks</span>
          <span className={styles.kpiValue}>{topMetrics.activeTasks}</span>
          <span className={styles.kpiSubtext}>Pending & In Progress</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Leave Requests</span>
          <span className={styles.kpiValue}>{topMetrics.leaveRequests}</span>
          <span className={styles.kpiSubtext}>Awaiting review</span>
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className={styles.kpiGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Productivity Score</span>
              <span className={styles.kpiValue}>{productivityScore}%</span>
              <span className={styles.kpiSubtext}>Company-wide metric</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Payroll Status ({payrollStatus.month})</span>
              <span className={styles.kpiValue}>{payrollStatus.processedPct}%</span>
              <span className={styles.kpiSubtext}>{payrollStatus.pendingCount} Employees Pending</span>
            </div>
          </div>

          {/* Project Matrix */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Project Matrix</h3>
            </div>
            {projectsMatrix.length === 0 ? renderEmptyState("No active projects.") : (
              <div className={styles.projectList}>
                {projectsMatrix.map((p: any) => (
                  <div key={p._id} className={styles.projectItem}>
                    <div className={styles.projectHeader}>
                      <span>{p.name}</span>
                      <span className={styles.projectStats}>{p.progress}% ({p.completedTasks}/{p.totalTasks})</span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div className={styles.progressBarFill} style={{ width: `${p.progress}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Recent Activity</h3>
            </div>
            {recentActivity.length === 0 ? renderEmptyState("No recent activity.") : (
              <div className={styles.activityFeed}>
                {recentActivity.map((act: any) => (
                  <div key={act.id} className={styles.activityItem}>
                    <div className={styles.activityAvatar}>
                      {act.avatar ? <img src={act.avatar} alt="avatar" /> : act.user.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.activityContent}>
                      <span className={styles.activityAction}><strong>{act.user}</strong> {act.action}</span>
                      <span className={styles.activityTime}>{new Date(act.time).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Quick Actions</h3>
            </div>
            <div className={styles.quickActionsGrid}>
              <button className={styles.actionBtn} onClick={() => router.push('/people')}>+ Add Employee</button>
              <button className={styles.actionBtn} onClick={() => router.push('/tasks')}>+ Assign Task</button>
              <button className={styles.actionBtn} onClick={() => router.push('/time-off')}>✓ Approve Leave</button>
              <button className={styles.actionBtn} onClick={() => router.push('/tasks')}>+ Create Project</button>
              <button className={styles.actionBtn} onClick={() => router.push('/chat/slack')}>💬 Open Slack</button>
              <button className={styles.actionBtn} onClick={() => router.push('/timesheets')}>📊 Attendance Report</button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* WFH vs On-Site */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Today's Location Split</h3>
            </div>
            {topMetrics.presentEmployees === 0 ? renderEmptyState("No attendance recorded today.") : (
              <>
                <div className={styles.splitBar}>
                  <div className={`${styles.splitSegment} ${styles.splitWfh}`} style={{ width: `${wfhVsOnSite.wfh}%` }}>{wfhVsOnSite.wfh > 0 && `${wfhVsOnSite.wfh}%`}</div>
                  <div className={`${styles.splitSegment} ${styles.splitOnsite}`} style={{ width: `${wfhVsOnSite.onSite}%` }}>{wfhVsOnSite.onSite > 0 && `${wfhVsOnSite.onSite}%`}</div>
                </div>
                <div className={styles.splitLabels}>
                  <span><strong style={{color: '#3b82f6'}}>WFH</strong> ({topMetrics.wfhEmployees})</span>
                  <span><strong style={{color: '#10b981'}}>On-Site</strong> ({topMetrics.presentEmployees - topMetrics.wfhEmployees})</span>
                </div>
              </>
            )}
          </div>

          {/* Quick Stats Grid */}
          <div className={styles.kpiGrid} style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className={styles.kpiCard} style={{ padding: '1rem' }}>
              <span className={styles.kpiLabel} style={{ fontSize: '0.75rem' }}>Online Now</span>
              <span className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{newWidgets.employeesOnline}</span>
            </div>
            <div className={styles.kpiCard} style={{ padding: '1rem' }}>
              <span className={styles.kpiLabel} style={{ fontSize: '0.75rem' }}>Avg Check-in</span>
              <span className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{newWidgets.avgCheckInTime || '--:--'}</span>
            </div>
            <div className={styles.kpiCard} style={{ padding: '1rem' }}>
              <span className={styles.kpiLabel} style={{ fontSize: '0.75rem' }}>Tasks Due</span>
              <span className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{newWidgets.tasksDueToday}</span>
              {newWidgets.overdueTasks > 0 && <span style={{ color: 'red', fontSize: '0.75rem', fontWeight: 600 }}>{newWidgets.overdueTasks} Overdue</span>}
            </div>
            <div className={styles.kpiCard} style={{ padding: '1rem' }}>
              <span className={styles.kpiLabel} style={{ fontSize: '0.75rem' }}>Late Arrivals</span>
              <span className={styles.kpiValue} style={{ fontSize: '1.5rem' }}>{newWidgets.lateArrivals}</span>
            </div>
          </div>

          {/* Upcoming Events */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Upcoming Events</h3>
            </div>
            <div className={styles.userList}>
              {upcomingBirthdays.length === 0 && upcomingAnniversaries.length === 0 && (
                <div className={styles.emptyState}>No upcoming events.</div>
              )}
              {upcomingBirthdays.map((user: any) => (
                <div key={`b-${user._id}`} className={styles.userListItem}>
                  <div className={styles.activityAvatar}>
                    {user.avatar ? <img src={user.avatar} alt="avatar" /> : user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.userListInfo}>
                    <span className={styles.userListName}>{user.name}</span>
                    <span className={styles.userListMeta}>🎂 Birthday on {new Date(user.nextBirthday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              ))}
              {upcomingAnniversaries.map((user: any) => (
                <div key={`a-${user._id}`} className={styles.userListItem}>
                  <div className={styles.activityAvatar}>
                    {user.avatar ? <img src={user.avatar} alt="avatar" /> : user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.userListInfo}>
                    <span className={styles.userListName}>{user.name}</span>
                    <span className={styles.userListMeta}>🎉 {user.yearsCompleted} Year Anniversary on {new Date(user.nextAnniversary).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Department Overview */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Department Overview</h3>
            </div>
            {departmentOverview.length === 0 ? renderEmptyState("No departments set.") : (
              <div className={styles.deptList}>
                {departmentOverview.map((dept: any) => {
                  const max = departmentOverview[0].count;
                  const pct = (dept.count / max) * 100;
                  return (
                    <div key={dept._id} className={styles.deptItem}>
                      <span className={styles.deptLabel}>{dept._id}</span>
                      <div className={styles.deptBarBg}>
                        <div className={styles.deptBarFill} style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className={styles.deptCount}>{dept.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Slack Status */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Slack Workspace Status</h3>
            </div>
            {!slackStatus.connected ? renderEmptyState("Workspace not connected.") : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <strong style={{ color: '#10b981' }}>Connected</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Last Sync</span>
                  <strong>{new Date(slackStatus.lastSync).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Channels</span>
                  <strong>{slackStatus.channels}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Members</span>
                  <strong>{slackStatus.members}</strong>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
