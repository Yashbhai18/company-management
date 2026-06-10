"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './page.module.css';
import QuickActions from '../../../components/layout/QuickActions';
import NotificationDrawer from '../../../components/layout/NotificationDrawer';
import ClockInOutButton from '../../../components/layout/ClockInOutButton';
import DatePicker from '../../../components/ui/DatePicker';
import { useDialog } from '../../../components/ui/DialogProvider';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface Holiday {
  _id: string;
  type: 'whole_org' | 'individual';
  targetUserIds?: User[];
  startDate: string;
  endDate: string;
  description: string;
  createdAt: string;
}

interface TimeOffRequest {
  _id: string;
  userId: User;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function TimeOffPage() {
  const { alert } = useDialog();
  const [currUser, setCurrUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Real-Time Toast & Notification Tracker
  const [toast, setToast] = React.useState<string | null>(null);
  const prevPendingRef = React.useRef<number | null>(null);

  // Shared Data
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  
  // Admin-Specific Data
  const [allRequests, setAllRequests] = React.useState<TimeOffRequest[]>([]);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [roster, setRoster] = React.useState<User[]>([]);
  
  // Employee-Specific Data
  const [myRequests, setMyRequests] = React.useState<TimeOffRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = React.useState(false);

  // Calendar states
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDayForModal, setSelectedDayForModal] = React.useState<Date | null>(null);

  // Form State - Create Holiday (Admin)
  const [mode, setMode] = React.useState<'whole_org' | 'individual'>('whole_org');
  const [selectedEmployees, setSelectedEmployees] = React.useState<User[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form State - Request Holiday (Employee)
  const [reqStart, setReqStart] = React.useState('');
  const [reqEnd, setReqEnd] = React.useState('');
  const [reqReason, setReqReason] = React.useState('');

  // Capture local today in YYYY-MM-DD format to enforce calendar baseline limits
  const todayStr = React.useMemo(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
  }, []);

  const fetchData = React.useCallback(async () => {
    try {
      const userResp = await api.get('/auth/me');
      const loggedInUser = userResp.data.user;
      setCurrUser(loggedInUser);

      const holidaysResp = await api.get('/time-off/holidays');
      setHolidays(holidaysResp.data.holidays);

      if (loggedInUser.role !== 'employee') {
        // Fetch Admins info
        const reqsResp = await api.get('/time-off/all-requests');
        const nextCount = reqsResp.data.pendingCount;
        
        // Detect real-time trigger for a new arriving pending request
        if (prevPendingRef.current !== null && nextCount > prevPendingRef.current) {
          setToast("🔔 New Employee Time Off Request Submitted!");
          setTimeout(() => setToast(null), 5000); // Auto dismiss after 5s
        }

        prevPendingRef.current = nextCount;
        setAllRequests(reqsResp.data.requests);
        setPendingCount(nextCount);

        const rosterResp = await api.get('/users');
        setRoster(rosterResp.data.users.filter((u: User) => u.role === 'employee'));
      } else {
        // Fetch Employee info
        const myReqsResp = await api.get('/time-off/my-requests');
        setMyRequests(myReqsResp.data.requests);
      }
    } catch (err) {
      console.error('Failed to load time off context:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trigger initial data fetch
  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // CONTINUOUS BACKGROUND REAL-TIME UPDATES: Every 6 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(endDate) < new Date(startDate)) {
      await alert('End date cannot be before the start date!', 'Validation Error');
      return;
    }

    if (mode === 'individual' && selectedEmployees.length === 0) {
      await alert('Please select at least one employee.', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/time-off/holiday', {
        type: mode,
        targetUserIds: mode === 'individual' ? selectedEmployees.map(u => u._id) : undefined,
        startDate,
        endDate,
        description
      });
      // Reset Form
      setStartDate('');
      setEndDate('');
      setDescription('');
      setSelectedEmployees([]);
      setSearchQuery('');
      // Refetch
      const holidaysResp = await api.get('/time-off/holidays');
      setHolidays(holidaysResp.data.holidays);
      await alert('Holiday assigned successfully!', 'Success');
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to assign holiday', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(reqEnd) < new Date(reqStart)) {
      await alert('End date cannot be before the start date!', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/time-off/request', {
        startDate: reqStart,
        endDate: reqEnd,
        reason: reqReason
      });
      // Reset Form
      setReqStart('');
      setReqEnd('');
      setReqReason('');
      setShowRequestModal(false);
      // Refetch
      const myReqsResp = await api.get('/time-off/my-requests');
      setMyRequests(myReqsResp.data.requests);
      await alert('Request submitted successfully!', 'Success');
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to request time off', 'Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await api.patch(`/time-off/request/${requestId}`, { status });
      // Update Lists
      const reqsResp = await api.get('/time-off/all-requests');
      setAllRequests(reqsResp.data.requests);
      setPendingCount(reqsResp.data.pendingCount);
      // Maintain accurate badge reference cache
      prevPendingRef.current = reqsResp.data.pendingCount;
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Review failed', 'Error');
    }
  };

  // Filter out users who have already been selected from the searchable roster dropdown
  const filteredRoster = roster.filter(u => 
    (u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     u.email.toLowerCase().includes(searchQuery.toLowerCase())) &&
    !selectedEmployees.some(sel => sel._id === u._id)
  );

  // Utility to derive only Pending Requests
  const activePendingRequests = React.useMemo(() => {
    return allRequests.filter(r => r.status === 'pending');
  }, [allRequests]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calendar Helpers
  const handlePrevMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const newDate = new Date(y, m - 2);
    setCalendarMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const newDate = new Date(y, m);
    setCalendarMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const calendarDays = React.useMemo(() => {
    const year = parseInt(calendarMonth.split('-')[0]);
    const month = parseInt(calendarMonth.split('-')[1]) - 1;
    
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(i);
    }
    return days;
  }, [calendarMonth]);

  const currentCalendarLabel = React.useMemo(() => {
    const year = parseInt(calendarMonth.split('-')[0]);
    const month = parseInt(calendarMonth.split('-')[1]) - 1;
    return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  const getDayEvents = (dayNum: number) => {
    const year = parseInt(calendarMonth.split('-')[0]);
    const month = parseInt(calendarMonth.split('-')[1]) - 1;
    
    const targetDateMidnight = new Date(year, month, dayNum);
    targetDateMidnight.setHours(0, 0, 0, 0);
    const targetTime = targetDateMidnight.getTime();
    
    const dayHolidays = holidays.filter(h => {
      const start = new Date(h.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(h.endDate);
      end.setHours(0, 0, 0, 0);
      return targetTime >= start.getTime() && targetTime <= end.getTime();
    });
    
    const isAdmin = currUser?.role !== 'employee';
    const requestsToUse = isAdmin ? allRequests : myRequests;
    const dayRequests = requestsToUse.filter(r => {
      const start = new Date(r.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(r.endDate);
      end.setHours(0, 0, 0, 0);
      return (r.status === 'approved' || r.status === 'pending') && 
             targetTime >= start.getTime() && targetTime <= end.getTime();
    });
    
    return { holidays: dayHolidays, requests: dayRequests };
  };

  const isToday = (dayNum: number) => {
    const now = new Date();
    const year = parseInt(calendarMonth.split('-')[0]);
    const month = parseInt(calendarMonth.split('-')[1]) - 1;
    return now.getDate() === dayNum && now.getMonth() === month && now.getFullYear() === year;
  };

  const handleDayClick = (dayNum: number) => {
    const year = parseInt(calendarMonth.split('-')[0]);
    const month = parseInt(calendarMonth.split('-')[1]) - 1;
    setSelectedDayForModal(new Date(year, month, dayNum));
  };

  if (isLoading) {
    return <div className={styles.loaderContainer}><div className={styles.loader}></div></div>;
  }

  const isAdmin = currUser?.role !== 'employee';

  return (
    <div className={styles.container}>
      
      {/* REALTIME FLOATING NOTIFICATION TOAST BANNER */}
      {toast && (
        <div className={styles.toast}>
          <span>{toast}</span>
        </div>
      )}

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Time Off & Holidays</h1>
          <p className={styles.sub}>
            {isAdmin 
              ? 'Schedule company-wide holidays and approve team requests.' 
              : 'Track official company holidays and request personalized time off.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <QuickActions />
          <NotificationDrawer />
          <ClockInOutButton />
        </div>
      </header>

      {/* View Switcher Toggle Bar */}
      <div className={styles.viewToggleBar}>
        <div className={styles.toggleGroup}>
          <button 
            type="button" 
            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('list')}
          >
            📋 List View
          </button>
          <button 
            type="button" 
            className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            📅 Calendar View
          </button>
        </div>

        {viewMode === 'calendar' && (
          <div className={styles.calendarNav}>
            <button type="button" onClick={handlePrevMonth} className={styles.navMonthBtn}>&lt;</button>
            <span className={styles.calendarMonthLabel}>{currentCalendarLabel}</span>
            <button type="button" onClick={handleNextMonth} className={styles.navMonthBtn}>&gt;</button>
          </div>
        )}
      </div>

      {viewMode === 'list' ? (
        isAdmin ? (
          /* ORGANIZATION / ADMIN MAIN VIEW - Refactored into tight Vertical Columns to banish white space! */
          <div className={styles.viewGrid}>
            
            {/* === COLUMN 1: ADMIN HOLIDAY ACTION CENTER === */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Card 1: Scheduler Form */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Assign a Holiday</h2>
                
                <div className={styles.toggleContainer}>
                  <button 
                    type="button" 
                    className={`${styles.toggleBtn} ${mode === 'whole_org' ? styles.toggleActive : ''}`}
                    onClick={() => { setMode('whole_org'); setSelectedEmployees([]); }}
                  >
                    Whole Org
                  </button>
                  <button 
                    type="button" 
                    className={`${styles.toggleBtn} ${mode === 'individual' ? styles.toggleActive : ''}`}
                    onClick={() => setMode('individual')}
                  >
                    Individual
                  </button>
                </div>

                <form onSubmit={handleCreateHoliday} className={styles.form}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {mode === 'individual' && (
                      <div className={styles.formGroup}>
                        <label>Target Employee(s)</label>
                        
                        {/* Display selected users as compact dynamic chips */}
                        {selectedEmployees.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            {selectedEmployees.map(emp => (
                              <div key={emp._id} className={styles.selectedBadge} style={{ padding: '0.4rem 0.6rem' }}>
                                <div className={styles.reqUser} style={{ marginBottom: 0 }}>
                                  <div className={styles.dropAvatar} style={{ width: '24px', height: '24px', fontSize: '0.65rem' }}>
                                    {emp.avatar ? <img src={emp.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : emp.name.charAt(0)}
                                  </div>
                                  <span className={styles.dropName} style={{ fontSize: '0.85rem' }}>{emp.name}</span>
                                </div>
                                <button 
                                  type="button" 
                                  className={styles.clearBtn} 
                                  onClick={() => setSelectedEmployees(prev => prev.filter(u => u._id !== emp._id))} 
                                  style={{ marginLeft: '0.5rem' }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Search input remains visible to add more employees */}
                        <div className={styles.searchWrapper}>
                          <input 
                            className={styles.input} 
                            placeholder="Type to select employees..." 
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                            onFocus={() => setShowDropdown(true)}
                          />
                          {showDropdown && searchQuery && (
                            <div className={styles.dropdownList}>
                              {filteredRoster.length > 0 ? (
                                filteredRoster.map(u => (
                                  <div 
                                    key={u._id} 
                                    className={styles.dropdownItem}
                                    onClick={() => { 
                                      setSelectedEmployees(prev => [...prev, u]); 
                                      setShowDropdown(false); 
                                      setSearchQuery(''); 
                                    }}
                                  >
                                    <div className={styles.dropAvatar}>{u.avatar ? <img src={u.avatar} alt="" style={{width:'100%',height:'100%',borderRadius:'50%'}} /> : u.name.charAt(0)}</div>
                                    <div>
                                      <div className={styles.dropName}>{u.name}</div>
                                      <div className={styles.dropEmail}>{u.email}</div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className={styles.dropdownItem} style={{color:'#94a3b8'}}>No additional employees found</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className={styles.formGroup}>
                      <label>Start Date</label>
                      <DatePicker 
                        value={startDate} 
                        onChange={setStartDate} 
                        min={todayStr} /* LOCK START DATE TO TODAY OR FUTURE */
                        placeholder="Select start date" 
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>End Date</label>
                      <DatePicker 
                        value={endDate} 
                        onChange={setEndDate} 
                        min={startDate || todayStr} 
                        placeholder="Select end date" 
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Reason / Description</label>
                      <textarea 
                        required 
                        className={styles.textarea} 
                        placeholder="e.g. National Holiday, Celebration, Sick Leave..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        style={{ minHeight: '90px' }}
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={isSubmitting} className={styles.submitBtn} style={{ marginTop: '1.5rem' }}>
                    {isSubmitting ? 'Publishing...' : 'Publish Holiday'}
                  </button>
                </form>
              </div>

              {/* Card 2: Assigned Holiday Ledger */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Assigned Holiday Ledger</h2>
                {holidays.length === 0 ? (
                  <div className={styles.emptyState}>No holidays declared yet.</div>
                ) : (
                  <div className={styles.historyList}>
                    {holidays.map(h => (
                      <div key={h._id} className={styles.itemCard}>
                        <div className={styles.itemHeader}>
                          <span className={styles.itemDate}>{formatDate(h.startDate)} {h.startDate !== h.endDate && `— ${formatDate(h.endDate)}`}</span>
                          <span className={h.type === 'whole_org' ? styles.badgeWhole : styles.badgeIndiv}>
                            {h.type === 'whole_org' ? 'Whole Org' : 'Individual'}
                          </span>
                        </div>
                        <p className={styles.itemDesc}>{h.description}</p>
                        {h.type === 'individual' && h.targetUserIds && h.targetUserIds.length > 0 && (
                          <span className={styles.itemMeta}>
                            Assigned To: <strong>{h.targetUserIds.map(u => u.name).join(', ')}</strong>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* === COLUMN 2: EMPLOYEE REQUEST PIPELINE === */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Card 3: Pending Holiday Requests */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>
                  <span>⏳ Pending Holiday Requests</span>
                  {activePendingRequests.length > 0 && (
                    <span className={styles.badgeInline}>{activePendingRequests.length}</span>
                  )}
                </h2>

                <div>
                  {activePendingRequests.length === 0 ? (
                    <div className={styles.emptyState} style={{ padding: '1.5rem 0' }}>
                      🎉 No active employee requests awaiting approval.
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {activePendingRequests.map(r => (
                        <div key={r._id} className={styles.itemCard}>
                          <div className={styles.itemHeader} style={{ marginBottom: '0.25rem' }}>
                            <div className={styles.reqUser} style={{ margin: 0 }}>
                              <div className={styles.dropAvatar} style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                                {r.userId.avatar ? <img src={r.userId.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : r.userId.name.charAt(0)}
                              </div>
                              <span className={styles.dropName} style={{ fontSize: '0.85rem' }}>{r.userId.name}</span>
                            </div>
                            <span className={styles.badgePending} style={{ fontSize: '0.65rem' }}>{r.status}</span>
                          </div>
                          
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                            {formatDate(r.startDate)} {r.startDate !== r.endDate && ` — ${formatDate(r.endDate)}`}
                          </div>
                          <p className={styles.itemDesc} style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>"{r.reason}"</p>
                          
                          <div className={styles.reqActions} style={{ marginTop: '0.5rem' }}>
                            <button 
                              className={styles.approveBtn} 
                              onClick={() => handleReviewRequest(r._id, 'approved')}
                              style={{ padding: '0.4rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            >
                              Approve
                            </button>
                            <button 
                              className={styles.rejectBtn} 
                              onClick={() => handleReviewRequest(r._id, 'rejected')}
                              style={{ padding: '0.4rem', fontSize: '0.75rem', borderRadius: '6px' }}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Request History Archive */}
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>
                  <span>📚 Request History Archive</span>
                </h2>
                
                <div>
                  {allRequests.length === 0 ? (
                    <div className={styles.emptyState}>
                      No prior requests recorded in history.
                    </div>
                  ) : (
                    <div className={styles.historyList}>
                      {allRequests.map(r => (
                        <div key={r._id} className={styles.itemCard}>
                          <div className={styles.itemHeader} style={{ marginBottom: '0.25rem' }}>
                            <div className={styles.reqUser} style={{ margin: 0 }}>
                              <div className={styles.dropAvatar} style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                                {r.userId.avatar ? <img src={r.userId.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} /> : r.userId.name.charAt(0)}
                              </div>
                              <span className={styles.dropName} style={{ fontSize: '0.85rem' }}>{r.userId.name}</span>
                            </div>
                            <span className={
                              r.status === 'pending' ? styles.badgePending : 
                              r.status === 'approved' ? styles.badgeApproved : 
                              styles.badgeRejected
                            } style={{ fontSize: '0.65rem' }}>
                              {r.status}
                            </span>
                          </div>
                          
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                            {formatDate(r.startDate)} {r.startDate !== r.endDate && ` — ${formatDate(r.endDate)}`}
                          </div>
                          <p className={styles.itemDesc} style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>"{r.reason}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          /* EMPLOYEE SIDE MAIN VIEW */
          <div className={styles.viewGrid}>
            {/* Section 1: Assigned Holidays */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>🏛️ Company Holidays Given</h2>
              <div className={styles.historyList}>
                {holidays.length === 0 ? (
                  <div className={styles.emptyState}>No holidays assigned yet</div>
                ) : (
                  holidays.map(h => (
                    <div key={h._id} className={styles.itemCard}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemDate}>{formatDate(h.startDate)} {h.startDate !== h.endDate && `— ${formatDate(h.endDate)}`}</span>
                        <span className={h.type === 'whole_org' ? styles.badgeWhole : styles.badgeIndiv}>
                          {h.type === 'whole_org' ? 'Whole Org' : 'Specifically for You'}
                        </span>
                      </div>
                      <p className={styles.itemDesc}>{h.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Section 2: Request Time Off & History */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                <span>🗓️ Request Time Off</span>
                <button onClick={() => setShowRequestModal(true)} className={styles.submitBtn} style={{marginTop:0, padding:'0.5rem 1rem'}}>
                  + Make New Request
                </button>
              </div>

              <div className={styles.historyList}>
                <h3 style={{fontSize:'0.9rem', color:'#94a3b8', marginBottom:'0.5rem', marginTop:'1rem', textTransform:'uppercase', fontWeight:700}}>Your Request Ledger</h3>
                {myRequests.length === 0 ? (
                  <div className={styles.emptyState}>You have not requested any time off.</div>
                ) : (
                  myRequests.map(r => (
                    <div key={r._id} className={styles.itemCard}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemDate}>{formatDate(r.startDate)} {r.startDate !== r.endDate && `— ${formatDate(r.endDate)}`}</span>
                        <span className={r.status === 'pending' ? styles.badgePending : r.status === 'approved' ? styles.badgeApproved : styles.badgeRejected}>
                          {r.status}
                        </span>
                      </div>
                      <p className={styles.itemDesc}>{r.reason}</p>
                      <span className={styles.itemMeta}>Requested: {new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      ) : (
        /* Calendar view grid container */
        <div className={styles.calendarContainer}>
          <div className={styles.calendarGrid}>
            {/* Calendar Headers */}
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
              <div key={day} className={styles.calendarHeaderCell}>
                <span className={styles.fullDayName}>{day}</span>
                <span className={styles.shortDayName}>{day.substring(0, 3)}</span>
              </div>
            ))}

            {/* Calendar Days */}
            {calendarDays.map((dayNum, idx) => {
              if (dayNum === null) {
                return <div key={`empty-${idx}`} className={styles.emptyCell}></div>;
              }

              const { holidays: dayHolidays, requests: dayRequests } = getDayEvents(dayNum);
              const totalEventsCount = dayHolidays.length + dayRequests.length;

              return (
                <div 
                  key={`day-${dayNum}`}
                  className={`${styles.calendarDayCell} ${isToday(dayNum) ? styles.todayCell : ''}`}
                  onClick={() => handleDayClick(dayNum)}
                >
                  <div className={styles.dayCellHeader}>
                    <span className={styles.dayNumber}>{dayNum}</span>
                    {totalEventsCount > 0 && (
                      <span className={styles.cellCountBadge}>{totalEventsCount}</span>
                    )}
                  </div>

                  <div className={styles.cellEventsWrapper}>
                    {/* Render Holidays */}
                    {dayHolidays.slice(0, 2).map(h => (
                      <div 
                        key={h._id} 
                        className={`${styles.eventStrip} ${h.type === 'whole_org' ? styles.eventHolidayWhole : styles.eventHolidayIndiv}`}
                        title={h.description}
                      >
                        🏛️ {h.description}
                      </div>
                    ))}

                    {/* Render Time-Off Requests */}
                    {dayRequests.slice(0, 3 - Math.min(dayHolidays.length, 2)).map(r => (
                      <div 
                        key={r._id} 
                        className={`${styles.eventStrip} ${r.status === 'approved' ? styles.eventRequestApproved : styles.eventRequestPending}`}
                        title={r.reason}
                      >
                        {currUser?.role !== 'employee' ? `👤 ${r.userId.name}: ${r.reason}` : `🌴 ${r.reason}`}
                      </div>
                    ))}

                    {/* Overflow */}
                    {totalEventsCount > 3 && (
                      <div className={styles.cellMore}>+ {totalEventsCount - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day Details Modal */}
      {selectedDayForModal && (
        <div className={styles.modalOverlay} onClick={() => setSelectedDayForModal(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Events for {selectedDayForModal.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setSelectedDayForModal(null)}>×</button>
            </div>

            <div className={styles.modalBody}>
              {(() => {
                const dayNum = selectedDayForModal.getDate();
                const { holidays: dayHolidays, requests: dayRequests } = getDayEvents(dayNum);

                if (dayHolidays.length === 0 && dayRequests.length === 0) {
                  return (
                    <div className={styles.modalEmpty}>
                      <p>No holidays or leave requests scheduled for this day.</p>
                    </div>
                  );
                }

                return (
                  <div className={styles.modalDetailsList}>
                    {/* Holidays Section */}
                    {dayHolidays.length > 0 && (
                      <div className={styles.modalSection}>
                        <h4 className={styles.modalSectionTitle}>🏛️ Holidays</h4>
                        <div className={styles.modalEventsList}>
                          {dayHolidays.map(h => (
                            <div key={h._id} className={styles.modalEventCard} style={{ borderLeft: '4px solid #f97316' }}>
                              <div className={styles.modalEventHeader}>
                                <span className={styles.modalEventName}>{h.description}</span>
                                <span className={h.type === 'whole_org' ? styles.badgeWhole : styles.badgeIndiv}>
                                  {h.type === 'whole_org' ? 'Whole Org' : 'Individual'}
                                </span>
                              </div>
                              <div className={styles.modalEventMeta}>
                                Duration: {formatDate(h.startDate)} {h.startDate !== h.endDate && `— ${formatDate(h.endDate)}`}
                              </div>
                              {h.type === 'individual' && h.targetUserIds && h.targetUserIds.length > 0 && (
                                <div className={styles.modalEventMeta}>
                                  Assigned to: <strong>{h.targetUserIds.map(u => u.name).join(', ')}</strong>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Time-Off Requests Section */}
                    {dayRequests.length > 0 && (
                      <div className={styles.modalSection} style={{ marginTop: dayHolidays.length > 0 ? '1.5rem' : '0' }}>
                        <h4 className={styles.modalSectionTitle}>🌴 Leave Requests</h4>
                        <div className={styles.modalEventsList}>
                          {dayRequests.map(r => (
                            <div 
                              key={r._id} 
                              className={styles.modalEventCard} 
                              style={{ borderLeft: r.status === 'approved' ? '4px solid #6366f1' : '4px solid #eab308' }}
                            >
                              <div className={styles.modalEventHeader}>
                                {currUser?.role !== 'employee' ? (
                                  <div className={styles.modalReqUser}>
                                    <div className={styles.modalAvatar}>
                                      {r.userId.avatar ? <img src={r.userId.avatar} alt="" /> : r.userId.name.charAt(0)}
                                    </div>
                                    <span className={styles.modalMemberName}>{r.userId.name}</span>
                                  </div>
                                ) : (
                                  <span className={styles.modalEventName}>Personal Leave</span>
                                )}
                                <span className={r.status === 'approved' ? styles.badgeApproved : styles.badgePending}>
                                  {r.status}
                                </span>
                              </div>
                              <p className={styles.modalEventDesc}>"{r.reason}"</p>
                              <div className={styles.modalEventMeta}>
                                Period: {formatDate(r.startDate)} {r.startDate !== r.endDate && `— ${formatDate(r.endDate)}`}
                              </div>

                              {/* Admin quick review inline inside calendar! */}
                              {isAdmin && r.status === 'pending' && (
                                <div className={styles.modalReviewActions}>
                                  <button 
                                    type="button"
                                    className={styles.modalApproveBtn}
                                    onClick={() => handleReviewRequest(r._id, 'approved')}
                                  >
                                    Approve
                                  </button>
                                  <button 
                                    type="button"
                                    className={styles.modalRejectBtn}
                                    onClick={() => handleReviewRequest(r._id, 'rejected')}
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DIALOG (Employee Create Request Popup) */}
      {showRequestModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2>Request Time Off</h2>
              <button className={styles.closeBtn} onClick={() => setShowRequestModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitRequest} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Start Date</label>
                <DatePicker 
                  value={reqStart} 
                  onChange={setReqStart} 
                  min={todayStr} /* LOCK START DATE TO TODAY OR FUTURE */
                  placeholder="Select start date" 
                />
              </div>

              <div className={styles.formGroup}>
                <label>End Date</label>
                <DatePicker 
                  value={reqEnd} 
                  onChange={setReqEnd} 
                  min={reqStart || todayStr} 
                  placeholder="Select end date" 
                />
              </div>

              <div className={styles.formGroup}>
                <label>Reason for Leave</label>
                <textarea 
                  required 
                  className={styles.textarea} 
                  placeholder="Describe why you require time off..."
                  value={reqReason}
                  onChange={e => setReqReason(e.target.value)}
                />
              </div>

              <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                {isSubmitting ? 'Submitting Request...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
