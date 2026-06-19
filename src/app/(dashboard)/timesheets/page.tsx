"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './page.module.css';
import QuickActions from '../../../components/layout/QuickActions';
import NotificationDrawer from '../../../components/layout/NotificationDrawer';
import ClockInOutButton from '../../../components/layout/ClockInOutButton';
import MonthPicker from '../../../components/ui/MonthPicker';

interface LogEntry {
  _id: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  } | string;
  clockIn: string;
  clockOut?: string;
  durationMinutes?: number;
  locationStatus?: 'on-site' | 'wfh';
}

export default function TimesheetsPage() {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [members, setMembers] = React.useState<any[]>([]);
  
  const [selectedMonth, setSelectedMonth] = React.useState('');
  const [selectedPeriod, setSelectedPeriod] = React.useState('all');
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd, setCustomEnd] = React.useState('');
  const [selectedMember, setSelectedMember] = React.useState('');
  
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'clockIn', direction: 'desc' });
  
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = React.useState(false);

  // Calendar and View Switcher States
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');
  const [selectedDayForModal, setSelectedDayForModal] = React.useState<Date | null>(null);
  const [isClosingModal, setIsClosingModal] = React.useState(false);

  const closeModalWithAnim = () => {
    setIsClosingModal(true);
    setTimeout(() => {
      setSelectedDayForModal(null);
      setIsClosingModal(false);
    }, 250);
  };
  
  // Custom Date Picker States
  const [customStartOpen, setCustomStartOpen] = React.useState(false);
  const [customEndOpen, setCustomEndOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(new Date()); 
  const [dayPickerMode, setDayPickerMode] = React.useState<'days' | 'months' | 'years'>('days');
  const [dayPickerYear, setDayPickerYear] = React.useState(new Date().getFullYear());

  // REFS for click-outside closing
  const memberDropdownRef = React.useRef<HTMLDivElement>(null);
  const periodDropdownRef = React.useRef<HTMLDivElement>(null);
  const customStartRef = React.useRef<HTMLDivElement>(null);
  const customEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (dropdownOpen && memberDropdownRef.current && !memberDropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (periodDropdownOpen && periodDropdownRef.current && !periodDropdownRef.current.contains(target)) {
        setPeriodDropdownOpen(false);
      }
      if (customStartOpen && customStartRef.current && !customStartRef.current.contains(target)) {
        setCustomStartOpen(false);
      }
      if (customEndOpen && customEndRef.current && !customEndRef.current.contains(target)) {
        setCustomEndOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen, periodDropdownOpen, customStartOpen, customEndOpen]);

  // Enhanced fetch to allow silent updates (no flashing loading spin)
  const fetchHistory = React.useCallback((isSilent = false) => {
    if (!isSilent) {
      setIsLoading(true);
    }
    let url = '/timesheets';
    const params = new URLSearchParams();
    
    if (selectedMonth) {
      params.append('month', selectedMonth);
    } else if (selectedPeriod !== 'all') {
      const now = new Date();
      let start: Date;
      let end: Date = now;

      if (selectedPeriod === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (selectedPeriod === 'last_week') {
        start = new Date();
        start.setDate(now.getDate() - 7);
      } else if (selectedPeriod === 'last_month') {
        start = new Date();
        start.setMonth(now.getMonth() - 1);
      } else if (selectedPeriod === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      } else {
        return; // Wait for dates if custom
      }
      
      params.append('start', start.toISOString());
      params.append('end', end.toISOString());
    }

    if (selectedMember) params.append('targetUser', selectedMember);
    
    const fullUrl = url + '?' + params.toString();

    Promise.all([
      api.get(fullUrl),
      api.get('/auth/me'),
      members.length === 0 ? api.get('/users').catch(() => ({ data: { users: [] } })) : Promise.resolve(null)
    ])
      .then(([timesheetRes, userRes, memberRes]) => {
        setEntries(timesheetRes.data.entries);
        setCurrentUser(userRes.data.user);
        if (memberRes) {
          setMembers(memberRes.data.users || []);
        }
      })
      .catch(err => {
        console.error('Timesheet real-time sync failure:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedMonth, selectedPeriod, customStart, customEnd, selectedMember, members.length]);

  // Standard UI-triggered load
  React.useEffect(() => {
    fetchHistory(false);
  }, [fetchHistory]);

  // INSTANT REFRESH ENGINE: Poll for shift completions silently every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchHistory(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatHours = (mins?: number) => {
    if (!mins && mins !== 0) return 'In Progress';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const periodOptions = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Last Week', value: 'last_week' },
    { label: 'Last Month', value: 'last_month' },
    { label: 'Custom Range', value: 'custom' },
  ];

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = (key === 'clockIn' || key === 'locationStatus') ? 'desc' : 'asc';
    if (sortConfig && sortConfig.key === key) {
      direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedEntries = React.useMemo(() => {
    if (!sortConfig) return entries;
    return [...entries].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortConfig.key === 'member') {
        aVal = typeof a.userId === 'object' ? a.userId.name : '';
        bVal = typeof b.userId === 'object' ? b.userId.name : '';
      } else if (sortConfig.key === 'locationStatus') {
        // Priority: wfh (2) > on-site (1) > unknown (0)
        const priority = { 'wfh': 2, 'on-site': 1 };
        aVal = priority[a.locationStatus as keyof typeof priority] || 0;
        bVal = priority[b.locationStatus as keyof typeof priority] || 0;
      } else {
        aVal = a[sortConfig.key as keyof LogEntry] ?? '';
        bVal = b[sortConfig.key as keyof LogEntry] ?? '';
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [entries, sortConfig]);

  // Calendar Helpers
  const calendarDays = React.useMemo(() => {
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : new Date().getMonth();
    
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
  }, [selectedMonth]);

  const currentMonthYearLabel = React.useMemo(() => {
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : new Date().getMonth();
    return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const getDayEntries = (dayNum: number) => {
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : new Date().getMonth();
    return entries.filter(e => {
      const d = new Date(e.clockIn);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dayNum;
    });
  };

  const isToday = (dayNum: number) => {
    const now = new Date();
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : new Date().getMonth();
    return now.getDate() === dayNum && now.getMonth() === month && now.getFullYear() === year;
  };

  const handleDayClick = (dayNum: number) => {
    const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
    const month = selectedMonth ? parseInt(selectedMonth.split('-')[1]) - 1 : new Date().getMonth();
    const clickedDate = new Date(year, month, dayNum);
    setSelectedDayForModal(clickedDate);
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortConfig?.key !== colKey) return (
      <svg className={styles.sortIcon} viewBox="0 0 20 20" fill="currentColor"><path d="M5 12l5 5 5-5H5zM5 8l5-5 5 5H5z" /></svg>
    );
    return sortConfig.direction === 'asc' ? (
      <svg className={`${styles.sortIcon} ${styles.activeSort}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5 10l5-5 5 5H5z" /></svg>
    ) : (
      <svg className={`${styles.sortIcon} ${styles.activeSort}`} viewBox="0 0 20 20" fill="currentColor"><path d="M5 10l5 5 5-5H5z" /></svg>
    );
  };

  const renderDayPicker = (selectedVal: string, onSelect: (val: string) => void) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const handleMonthChange = (offset: number) => {
      const newDate = new Date(viewDate);
      newDate.setMonth(newDate.getMonth() + offset);
      setViewDate(newDate);
    };

    const handleYearPick = (y: number) => {
      const newDate = new Date(viewDate);
      newDate.setFullYear(y);
      setViewDate(newDate);
      setDayPickerMode('months');
    };

    const handleMonthPick = (mIdx: number) => {
      const newDate = new Date(viewDate);
      newDate.setMonth(mIdx);
      setViewDate(newDate);
      setDayPickerMode('days');
    };

    if (dayPickerMode === 'years') {
      return (
        <div className={styles.dayPickerDropdown}>
          <div className={styles.monthPickerHeader}>
            <button type="button" onClick={() => setDayPickerYear(y => y - 10)}>&lt;&lt;</button>
            <span>Select Year</span>
            <button type="button" onClick={() => setDayPickerYear(y => y + 10)}>&gt;&gt;</button>
          </div>
          <div className={styles.yearGrid}>
            {Array.from({ length: 12 }, (_, i) => {
              const y = dayPickerYear - 5 + i;
              return (
                <div 
                  key={y} 
                  className={`${styles.monthGridItem} ${y === year ? styles.selectedMonthItem : ''}`}
                  onClick={() => handleYearPick(y)}
                >
                  {y}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (dayPickerMode === 'months') {
      return (
        <div className={styles.dayPickerDropdown}>
          <div className={styles.monthPickerHeader}>
            <button type="button" onClick={() => { const d = new Date(viewDate); d.setFullYear(viewDate.getFullYear() - 1); setViewDate(d); }}>&lt;</button>
            <span className={styles.interactiveYear} onClick={() => { setDayPickerYear(year); setDayPickerMode('years'); }}>
              {year}
            </span>
            <button type="button" onClick={() => { const d = new Date(viewDate); d.setFullYear(viewDate.getFullYear() + 1); setViewDate(d); }}>&gt;</button>
          </div>
          <div className={styles.monthGrid}>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, idx) => (
              <div 
                key={m} 
                className={`${styles.monthGridItem} ${idx === month ? styles.selectedMonthItem : ''}`}
                onClick={() => handleMonthPick(idx)}
              >
                {m}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Default: Days view
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    
    const monthName = viewDate.toLocaleString('default', { month: 'long' });

    return (
      <div className={styles.dayPickerDropdown}>
        <div className={styles.monthPickerHeader}>
          <button type="button" onClick={() => handleMonthChange(-1)}>&lt;</button>
          <span className={styles.interactiveMonthYear} onClick={() => setDayPickerMode('months')}>
            {monthName} {year}
          </span>
          <button type="button" onClick={() => handleMonthChange(1)}>&gt;</button>
        </div>
        
        <div className={styles.dayGridLabels}>
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        
        <div className={styles.dayGrid}>
          {days.map((d, idx) => {
            if (d === null) return <div key={`empty-${idx}`} className={styles.emptyDay}></div>;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = selectedVal === dateStr;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;
            return (
              <div 
                key={d} 
                className={`${styles.dayGridItem} ${isSelected ? styles.selectedDayItem : ''} ${isToday ? styles.todayItem : ''}`}
                onClick={() => onSelect(dateStr)}
              >
                {d}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {currentUser?.role === 'employee' ? 'Personal Timesheets' : 'Team Timesheets'}
          </h1>
          <p className={styles.sub}>
            {currentUser?.role === 'employee' ? 'Review your recent activity logs.' : 'Review global organization shift reports.'}
          </p>
        </div>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filterControls}>
          {currentUser?.role !== 'employee' && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Select Member</label>
              <div className={styles.customSelectWrapper} ref={memberDropdownRef}>
                <button 
                  type="button"
                  className={styles.customSelectBtn}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  {selectedMember ? members.find(m => m._id === selectedMember)?.name : 'All Team Members'}
                  <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div className={styles.dropdownMenu}>
                    <div 
                      className={styles.dropdownItem} 
                      onClick={() => { setSelectedMember(''); setDropdownOpen(false); }}
                    >
                      All Team Members
                    </div>
                    {members.map(m => (
                      <div 
                        key={m._id} 
                        className={styles.dropdownItem} 
                        onClick={() => { setSelectedMember(m._id); setDropdownOpen(false); }}
                      >
                        {m.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* PERIOD FILTER (Only in List View) */}
          {viewMode === 'list' && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Quick Filter</label>
              <div className={styles.customSelectWrapper} ref={periodDropdownRef}>
                <button 
                  type="button"
                  className={styles.customSelectBtn}
                  onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                >
                  {periodOptions.find(p => p.value === selectedPeriod)?.label}
                  <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </button>

                {periodDropdownOpen && (
                  <div className={styles.dropdownMenu}>
                    {periodOptions.map(p => (
                      <div 
                        key={p.value} 
                        className={`${styles.dropdownItem} ${selectedPeriod === p.value ? styles.selectedItem : ''}`}
                        onClick={() => { 
                          setSelectedPeriod(p.value); 
                          setSelectedMonth(''); // Reset month if period is chosen
                          setPeriodDropdownOpen(false); 
                        }}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'list' && selectedPeriod === 'custom' && (
            <>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Start Date</label>
                <div className={styles.customSelectWrapper} ref={customStartRef}>
                  <button 
                    type="button" 
                    className={styles.customSelectBtn}
                    onClick={() => setCustomStartOpen(!customStartOpen)}
                  >
                    {customStart ? formatDate(customStart) : 'Pick Start Date'}
                    <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {customStartOpen && renderDayPicker(customStart, (val) => { setCustomStart(val); setCustomStartOpen(false); })}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>End Date</label>
                <div className={styles.customSelectWrapper} ref={customEndRef}>
                  <button 
                    type="button" 
                    className={styles.customSelectBtn}
                    onClick={() => setCustomEndOpen(!customEndOpen)}
                  >
                    {customEnd ? formatDate(customEnd) : 'Pick End Date'}
                    <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {customEndOpen && renderDayPicker(customEnd, (val) => { setCustomEnd(val); setCustomEndOpen(false); })}
                </div>
              </div>
            </>
          )}

          {/* Month Picker is shown in calendar mode OR in list mode when custom range is NOT selected */}
          {(viewMode === 'calendar' || selectedPeriod !== 'custom') && (
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Select Month</label>
              <div className={styles.customSelectWrapper} style={{ minWidth: '220px' }}>
                <MonthPicker
                  value={selectedMonth}
                  onChange={(val) => {
                    setSelectedMonth(val);
                    setSelectedPeriod('all'); // Reset period if month is chosen
                  }}
                  placeholder="Pick Month"
                />
              </div>
            </div>
          )}

          {/* VIEW TOGGLE */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>View Format</label>
            <div className={styles.toggleGroup}>
              <button 
                type="button"
                className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleActive : ''}`}
                onClick={() => setViewMode('list')}
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                List
              </button>
              <button 
                type="button"
                className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleActive : ''}`}
                onClick={() => {
                  setViewMode('calendar');
                  // Ensure a month is selected for calendar view
                  if (!selectedMonth) {
                    const now = new Date();
                    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                    setSelectedPeriod('all');
                  }
                }}
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Calendar
              </button>
            </div>
          </div>
        </div>

        <div className={styles.filterActions}>
          {(selectedMonth || selectedPeriod !== 'all' || selectedMember) && (
            <button 
              onClick={() => { 
                setSelectedMonth(''); 
                setSelectedPeriod('all'); 
                setSelectedMember('');
                setCustomStart('');
                setCustomEnd('');
              }} 
              className={styles.clearBtnTop}
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                {currentUser?.role !== 'employee' && <th>Member</th>}
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Location</th>
                <th>Calculated Duration</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((n) => (
                <tr key={n}>
                  {currentUser?.role !== 'employee' && (
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="skeleton skeleton-avatar" style={{ width: '24px', height: '24px' }}></div>
                        <div className="skeleton skeleton-text" style={{ width: '60px', height: '14px', marginBottom: 0 }}></div>
                      </div>
                    </td>
                  )}
                  <td><div className="skeleton skeleton-text" style={{ width: '100px', height: '14px', marginBottom: 0 }}></div></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '60px', height: '14px', marginBottom: 0 }}></div></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '60px', height: '14px', marginBottom: 0 }}></div></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '50px', height: '14px', marginBottom: 0 }}></div></td>
                  <td><div className="skeleton skeleton-text" style={{ width: '70px', height: '14px', marginBottom: 0 }}></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'list' ? (
        sortedEntries.length === 0 ? (
          <div className={styles.emptyCard}>
            <p>No work hours logged yet.</p>
            <span>Start your shift on the Dashboard to begin tracking!</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {currentUser?.role !== 'employee' && (
                    <th onClick={() => handleSort('member')} className={styles.sortableHeader}>
                      Member <SortIcon colKey="member" />
                    </th>
                  )}
                  <th onClick={() => handleSort('clockIn')} className={styles.sortableHeader}>
                    Date <SortIcon colKey="clockIn" />
                  </th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th onClick={() => handleSort('locationStatus')} className={styles.sortableHeader}>
                    Location <SortIcon colKey="locationStatus" />
                  </th>
                  <th onClick={() => handleSort('durationMinutes')} className={styles.sortableHeader}>
                    Calculated Duration <SortIcon colKey="durationMinutes" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => {
                  const m: any = typeof e.userId === 'object' ? e.userId : null;
                  return (
                    <tr key={e._id}>
                      {currentUser?.role !== 'employee' && (
                        <td className={styles.memberCell}>
                          <div className={styles.miniAvatar}>
                            {m?.avatar ? <img src={m.avatar} className={styles.fullImgCover} alt="" /> : (m?.name?.charAt(0) || '?')}
                          </div>
                          <span className={styles.mNameText}>{m?.name || 'Unknown'}</span>
                        </td>
                      )}
                      <td className={styles.primaryText}>{formatDate(e.clockIn)}</td>
                      <td>{formatTime(e.clockIn)}</td>
                    <td>
                      {e.clockOut ? (
                        formatTime(e.clockOut)
                      ) : (
                        <span className={styles.badge}>Active Now</span>
                      )}
                    </td>
                    <td>
                      <span className={e.locationStatus === 'on-site' ? styles.onsiteBadge : styles.wfhBadge}>
                        {e.locationStatus === 'on-site' ? 'On-site' : 'WFH'}
                      </span>
                    </td>
                      <td className={styles.boldText}>{formatHours(e.durationMinutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Calendar view container */
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

              const dayEntries = getDayEntries(dayNum);

              return (
                <div 
                  key={`day-${dayNum}`}
                  className={`${styles.calendarDayCell} ${isToday(dayNum) ? styles.todayCell : ''}`}
                  onClick={() => handleDayClick(dayNum)}
                >
                  <div className={styles.dayCellHeader}>
                    <span className={styles.dayNumber}>{dayNum}</span>
                    {dayEntries.length > 0 && (
                      <span className={styles.cellCountBadge}>{dayEntries.length}</span>
                    )}
                  </div>

                  <div className={styles.cellEntriesWrapper}>
                    {currentUser?.role === 'employee' ? (
                      dayEntries.slice(0, 2).map(e => (
                        <div 
                          key={e._id} 
                          className={`${styles.cellEntryBadge} ${e.locationStatus === 'on-site' ? styles.cellOnsite : styles.cellWfh}`}
                        >
                          <span className={styles.cellTime}>
                            {formatTime(e.clockIn)} - {e.clockOut ? formatTime(e.clockOut) : 'Live'}
                          </span>
                          <span className={styles.cellHours}>
                            {e.durationMinutes !== undefined ? formatHours(e.durationMinutes) : 'Active'}
                          </span>
                        </div>
                      ))
                    ) : (
                      dayEntries.slice(0, 3).map(e => {
                        const m: any = typeof e.userId === 'object' ? e.userId : null;
                        return (
                          <div 
                            key={e._id} 
                            className={`${styles.cellTeamEntry} ${e.locationStatus === 'on-site' ? styles.cellOnsite : styles.cellWfh}`}
                          >
                            <span className={styles.cellTeamName}>{m?.name || 'Unknown'}</span>
                            <span className={styles.cellTeamDuration}>
                              {e.durationMinutes !== undefined ? formatHours(e.durationMinutes) : 'Live'}
                            </span>
                          </div>
                        );
                      })
                    )}

                    {/* Overflow details indicators */}
                    {currentUser?.role === 'employee' && dayEntries.length > 2 && (
                      <div className={styles.cellMore}>+ {dayEntries.length - 2} more shifts</div>
                    )}
                    {currentUser?.role !== 'employee' && dayEntries.length > 3 && (
                      <div className={styles.cellMore}>+ {dayEntries.length - 3} more</div>
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
        <div className={`${styles.modalOverlay} ${isClosingModal ? 'closingOverlay' : ''}`} onClick={closeModalWithAnim}>
          <div className={`${styles.modalContent} ${isClosingModal ? 'closingContent' : ''}`} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Logs for {selectedDayForModal.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <button type="button" className={styles.modalCloseBtn} onClick={closeModalWithAnim}>×</button>
            </div>
            
            <div className={styles.modalBody}>
              {(() => {
                const dayNum = selectedDayForModal.getDate();
                const dayEntries = getDayEntries(dayNum);
                
                if (dayEntries.length === 0) {
                  return (
                    <div className={styles.modalEmpty}>
                      <p>No shifts logged on this day.</p>
                    </div>
                  );
                }
                
                return (
                  <div className={styles.modalList}>
                    {dayEntries.map(e => {
                      const m: any = typeof e.userId === 'object' ? e.userId : null;
                      return (
                        <div key={e._id} className={styles.modalRow}>
                          {currentUser?.role !== 'employee' && (
                            <div className={styles.modalMember}>
                              <div className={styles.modalAvatar}>
                                {m?.avatar ? <img src={m.avatar} alt="" /> : (m?.name?.charAt(0) || '?')}
                              </div>
                              <span className={styles.modalMemberName}>{m?.name || 'Unknown'}</span>
                            </div>
                          )}
                          <div className={styles.modalShiftInfo}>
                            <span className={styles.modalSubLabel}>Clock In / Out</span>
                            <span className={styles.modalVal}>{formatTime(e.clockIn)} - {e.clockOut ? formatTime(e.clockOut) : 'Active Now'}</span>
                          </div>
                          <div className={styles.modalLocation}>
                            <span className={e.locationStatus === 'on-site' ? styles.onsiteBadge : styles.wfhBadge}>
                              {e.locationStatus === 'on-site' ? 'On-site' : 'WFH'}
                            </span>
                          </div>
                          <div className={styles.modalHours}>
                            <span className={styles.modalSubLabel}>Duration</span>
                            <span className={styles.modalDurationText}>{formatHours(e.durationMinutes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
