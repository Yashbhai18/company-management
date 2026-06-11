"use client";
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import CustomSelect from '../../../components/ui/CustomSelect';
import MonthPicker from '../../../components/ui/MonthPicker';
import { useDialog } from '../../../components/ui/DialogProvider';
import styles from './page.module.css';

type SalaryRow = {
  date: string;
  dayName: string;
  isWeekend: boolean;
  isWorkingDay: boolean;
  hasValidAttendance: boolean;
  attendanceStatus: 'full' | 'half' | 'absent';
  clockIn: string | null;
  clockOut: string | null;
  earned: number;
};

type SalarySheet = {
  employee: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
    role: string;
  };
  month: string;
  baseMonthlySalary: number;
  totalDaysInMonth: number;
  totalValidWorkingDays: number;
  payableDays: number;
  dailyRate: number;
  totalSalary: number;
  rows: SalaryRow[];
};

type ViewerUser = {
  _id?: string;
  name: string;
  email: string;
  role: string;
};

type EmployeeOption = {
  _id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
};

type SortKey = keyof Pick<SalaryRow, 'date' | 'dayName' | 'isWorkingDay' | 'hasValidAttendance' | 'clockIn' | 'clockOut' | 'earned'>;
type SortDirection = 'asc' | 'desc';

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const formatMoney = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateDMY = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[monthIdx];
  if (!month) return dateStr;
  return `${day} ${month} ${year}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const compareValues = (left: SalaryRow, right: SalaryRow, sortKey: SortKey, direction: SortDirection) => {
  const multiplier = direction === 'asc' ? 1 : -1;

  const toComparable = (row: SalaryRow) => {
    switch (sortKey) {
      case 'date':
        return new Date(row.date).getTime();
      case 'clockIn':
      case 'clockOut':
        return row[sortKey] ? new Date(row[sortKey] as string).getTime() : -1;
      case 'earned':
        return row.earned;
      case 'isWorkingDay':
      case 'hasValidAttendance':
        return row[sortKey] ? 1 : 0;
      case 'dayName':
      default:
        return row[sortKey].toLowerCase();
    }
  };

  const aValue = toComparable(left);
  const bValue = toComparable(right);

  if (typeof aValue === 'string' && typeof bValue === 'string') {
    return aValue.localeCompare(bValue) * multiplier;
  }

  return ((aValue as number) - (bValue as number)) * multiplier;
};

function SalaryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') || '';
  const initialMonth = searchParams.get('month') || getCurrentMonth();

  const [month, setMonth] = React.useState(initialMonth);
  const [selectedUserId, setSelectedUserId] = React.useState(userId);
  const [viewer, setViewer] = React.useState<ViewerUser | null>(null);
  const [employees, setEmployees] = React.useState<EmployeeOption[]>([]);
  const [sheet, setSheet] = React.useState<SalarySheet | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>('date');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('asc');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [error, setError] = React.useState('');

  const { alert, confirm, confirm2fa } = useDialog();

  // Custom salary & employee card dropdown states
  const [inputSalary, setInputSalary] = React.useState('10000');
  const [reloadTrigger, setReloadTrigger] = React.useState(0);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = React.useState(false);
  const employeeDropdownRef = React.useRef<HTMLDivElement>(null);

  // Sync buffer input salary when sheet loads/changes
  React.useEffect(() => {
    if (sheet) {
      setInputSalary(sheet.baseMonthlySalary.toString());
    }
  }, [sheet]);

  const handleConfirmSalary = async () => {
    const employeeName = sheet?.employee?.name || 'this employee';

    // Check if admin has 2FA enabled
    let has2fa = false;
    try {
      const meResp = await api.get('/auth/me');
      has2fa = !!(meResp.data.user?.twoFactorEnabled);
    } catch { /* ignore */ }

    const dialogMessage = `You are about to change the base monthly salary of ${employeeName} to ₹${Number(inputSalary).toLocaleString()}. ${has2fa ? 'Verify your identity to continue.' : 'Are you sure?'}`;
    const dialogTitle = has2fa ? 'Authorize Salary Change' : 'Confirm Salary Change';

    const ok = has2fa
      ? await confirm2fa(dialogMessage, dialogTitle)
      : await confirm(dialogMessage, dialogTitle);

    if (ok) {
      try {
        setIsLoading(true);
        await api.patch(`/users/${selectedUserId}`, { baseSalary: Number(inputSalary) });
        setReloadTrigger(prev => prev + 1);
      } catch (err: any) {
        alert(err.response?.data?.message || 'Failed to update employee base salary.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  React.useEffect(() => {
    setMonth(initialMonth);
  }, [initialMonth]);

  React.useEffect(() => {
    setSelectedUserId(userId);
  }, [userId]);

  React.useEffect(() => {
    let cancelled = false;

    const loadViewer = async () => {
      try {
        const meResp = await api.get('/auth/me');
        if (cancelled) return;

        const nextViewer = meResp.data.user as ViewerUser;
        setViewer(nextViewer);

        if (nextViewer.role === 'admin' || nextViewer.role === 'super_admin') {
          const usersResp = await api.get('/users');
          if (cancelled) return;
          const activeEmployees = (usersResp.data.users || []).filter((u: EmployeeOption) => u.role === 'employee');
          setEmployees(activeEmployees);

          // If Admin, default to the first employee if no userId in URL
          if (!userId && activeEmployees.length > 0) {
            setSelectedUserId(activeEmployees[0]._id);
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set('userId', activeEmployees[0]._id);
            router.replace(`${nextUrl.pathname}${nextUrl.search}`);
          } else if (userId) {
            setSelectedUserId(userId);
          }
        } else {
          setEmployees([]);
          if (!userId && nextViewer._id) {
            setSelectedUserId(nextViewer._id);
          } else if (userId) {
            setSelectedUserId(userId);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load employee options.');
        }
      }
    };

    loadViewer();

    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  // Handle click-outside for Employee Card dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownOpen && employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        setEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [employeeDropdownOpen]);

  React.useEffect(() => {
    if (!selectedUserId) {
      if (viewer) {
        setError('Missing employee reference.');
      }
      setSheet(null);
      return;
    }

    const loadSheet = async () => {
      setIsLoading(true);
      setError('');
      setSheet(null);
      try {
        const res = await api.get('/timesheets/salary-sheet', {
          params: { userId: selectedUserId, month },
        });
        setSheet(res.data);
      } catch (err: any) {
        setSheet(null);
        setError(err.response?.data?.message || 'Failed to load salary sheet.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSheet();
  }, [selectedUserId, month, reloadTrigger, viewer]);

  const isAdminViewer = viewer?.role === 'admin' || viewer?.role === 'super_admin';

  const sortedRows = React.useMemo(() => {
    if (!sheet) return [] as SalaryRow[];
    return [...sheet.rows].sort((left, right) => compareValues(left, right, sortKey, sortDirection));
  }, [sheet, sortKey, sortDirection]);

  const updateMonth = (nextMonth: string) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('month', nextMonth);
    if (selectedUserId) {
      nextUrl.searchParams.set('userId', selectedUserId);
    }
    router.replace(`${nextUrl.pathname}${nextUrl.search}`);
    setMonth(nextMonth);
  };

  const updateEmployee = (nextUserId: string) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('month', month);
    nextUrl.searchParams.set('userId', nextUserId);
    router.replace(`${nextUrl.pathname}${nextUrl.search}`);
    setSelectedUserId(nextUserId);
  };

  const toggleSort = (nextSortKey: SortKey) => {
    setSortDirection((currentDirection) => (sortKey === nextSortKey ? (currentDirection === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(nextSortKey);
  };

  const sortLabel = (label: string, key: SortKey) => (
    <button type="button" className={styles.sortBtn} onClick={() => toggleSort(key)}>
      <span>{label}</span>
      <span className={styles.sortGlyph}>{sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  );

  const downloadCsv = async () => {
    if (!selectedUserId) return;
    setIsDownloading(true);
    try {
      const response = await api.get('/timesheets/salary-sheet', {
        params: { userId: selectedUserId, month, format: 'csv' },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `salary-sheet-${month}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download CSV.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <p className={styles.eyebrow}>Monthly Salary Breakdown</p>
          <h1 className={styles.title}>Salary Sheet</h1>
          <p className={styles.subTitle}>Fixed base salary: 10,000 per month. Weekends are excluded from the daily rate. Shifts ≥ 7 hours count as a Full Day, otherwise they count as a Half Day (50% pay).</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={downloadCsv} disabled={!sheet || isDownloading}>
            {isDownloading ? 'Preparing CSV...' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.controls}>
          <div className={styles.controlGroup} style={{ minWidth: '200px' }}>
            <span>Month</span>
            <MonthPicker
              value={month}
              onChange={(val) => updateMonth(val)}
            />
          </div>

          <div className={styles.controlGroup}>
            <span>Base Salary (₹)</span>
            <div className={styles.salaryInputWrapper}>
              <input
                type="number"
                value={inputSalary}
                onChange={(e) => setInputSalary(e.target.value)}
                className={styles.salaryInput}
                min="0"
                placeholder="10000"
                disabled={!isAdminViewer}
              />
              {isAdminViewer && (
                <button
                  type="button"
                  onClick={handleConfirmSalary}
                  className={styles.confirmSalaryBtn}
                  disabled={!inputSalary || inputSalary === (sheet?.baseMonthlySalary?.toString() || '10000')}
                >
                  Confirm
                </button>
              )}
            </div>
          </div>

          {sheet && (
            <div className={styles.employeeCardWrapper} ref={employeeDropdownRef}>
              <div 
                className={`${styles.employeeCard} ${isAdminViewer ? styles.interactiveCard : ''}`}
                onClick={() => isAdminViewer && setEmployeeDropdownOpen(!employeeDropdownOpen)}
              >
                <div className={styles.avatar}>{sheet.employee.name.charAt(0)}</div>
                <div className={styles.employeeInfo}>
                  <div className={styles.employeeName}>{sheet.employee.name}</div>
                  <div className={styles.employeeMeta}>{sheet.employee.email}</div>
                </div>
                {isAdminViewer && (
                  <svg className={styles.cardChevron} style={{ transform: employeeDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              {isAdminViewer && employeeDropdownOpen && (
                <div className={styles.employeeDropdownMenu}>
                  {employees.map(e => (
                    <div 
                      key={e._id} 
                      className={`${styles.employeeDropdownItem} ${e._id === selectedUserId ? styles.activeItem : ''}`}
                      onClick={() => {
                        updateEmployee(e._id);
                        setEmployeeDropdownOpen(false);
                      }}
                    >
                      <div className={styles.miniAvatar}>{e.name.charAt(0)}</div>
                      <div className={styles.employeeInfo}>
                        <div className={styles.dropItemName}>{e.name}</div>
                        <div className={styles.dropItemEmail}>{e.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {isLoading ? (
          <div className={styles.loadingBox}>Loading salary sheet...</div>
        ) : sheet ? (
          <>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span>Daily Rate</span>
                <strong>₹ {formatMoney(sheet.dailyRate)}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Valid Working Days</span>
                <strong>{sheet.totalValidWorkingDays}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Payable Days</span>
                <strong>{sheet.payableDays}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Total Salary</span>
                <strong>₹ {formatMoney(sheet.totalSalary)}</strong>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{sortLabel('Date', 'date')}</th>
                    <th>{sortLabel('Day', 'dayName')}</th>
                    <th>{sortLabel('Working Day', 'isWorkingDay')}</th>
                    <th>{sortLabel('Attendance Status', 'hasValidAttendance')}</th>
                    <th>{sortLabel('Clock In', 'clockIn')}</th>
                    <th>{sortLabel('Clock Out', 'clockOut')}</th>
                    <th>{sortLabel('Earned', 'earned')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.date} className={row.isWeekend ? styles.weekendRow : row.attendanceStatus === 'full' ? styles.presentRow : row.attendanceStatus === 'half' ? styles.halfDayRow : styles.absentRow}>
                      <td>{formatDateDMY(row.date)}</td>
                      <td>{row.dayName}</td>
                      <td>{row.isWorkingDay ? 'Yes' : 'No'}</td>
                      <td>
                        {row.isWeekend ? (
                          <span className={`${styles.statusBadge} ${styles.badgeWeekend}`}>Weekend</span>
                        ) : row.attendanceStatus === 'full' ? (
                          <span className={`${styles.statusBadge} ${styles.badgeFull}`}>Full Day</span>
                        ) : row.attendanceStatus === 'half' ? (
                          <span className={`${styles.statusBadge} ${styles.badgeHalf}`}>Half Day</span>
                        ) : (
                          <span className={`${styles.statusBadge} ${styles.badgeAbsent}`}>Absent</span>
                        )}
                      </td>
                      <td>{formatDateTime(row.clockIn)}</td>
                      <td>{formatDateTime(row.clockOut)}</td>
                      <td>₹ {formatMoney(row.earned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>No salary sheet loaded yet.</div>
        )}
      </div>
    </div>
  );
}

export default function SalaryPage() {
  return (
    <React.Suspense fallback={<div className={styles.loadingBox}>Loading salary page...</div>}>
      <SalaryPageContent />
    </React.Suspense>
  );
}
