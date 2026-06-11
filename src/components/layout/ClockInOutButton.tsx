"use client";
import React from 'react';
import api from '../../lib/api';
import styles from './clockbutton.module.css';
import { useDialog } from '../ui/DialogProvider';
import { useSocket } from '../../hooks/useSocket';
import { SessionTimeoutModal } from './SessionTimeoutModal';

export default function ClockInOutButton() {
  const { alert, confirm } = useDialog();
  const socket = useSocket();
  const [user, setUser] = React.useState<any>(null);
  const [activeShift, setActiveShift] = React.useState<any>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const isProcessingRef = React.useRef(false);

  // Session timeout warning state
  const [sessionWarning, setSessionWarning] = React.useState<{
    minutesIn: number;
    minutesRemaining: number;
    clockIn: string;
  } | null>(null);
  // Toast for auto-clock-out notification
  const [autoClockOutToast, setAutoClockOutToast] = React.useState<string | null>(null);

  // Localized precise stopwatch ticking state
  const [tickerTime, setTickerTime] = React.useState(new Date());

  React.useEffect(() => {
    if (!activeShift) return;

    // Reseed ticker immediately when clock-in state resolves
    setTickerTime(new Date());

    const interval = setInterval(() => {
      setTickerTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeShift]);

  const fetchShiftStatus = React.useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/timesheets/active')
      ]);
      setUser(uRes.data.user);
      setActiveShift(sRes.data.active);
    } catch (err) {
      console.error('ClockBtn status sync failed:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchShiftStatus();
  }, [fetchShiftStatus]);

  // Session warning & auto-clock-out socket listeners
  React.useEffect(() => {
    if (!socket) return;

    const handleGlobalUpdate = () => {
      console.info('[attendance] Real-time sync triggered via socket event.');
      fetchShiftStatus();
    };

    const handleSessionWarning = (payload: { minutesIn: number; minutesRemaining: number; clockIn: string }) => {
      console.info('[attendance] Session warning received:', payload);
      setSessionWarning(payload);
    };

    const handleAutoClockOut = (payload: { durationMinutes: number; clockIn: string; clockOut: string }) => {
      console.info('[attendance] Auto clock-out received:', payload);
      setSessionWarning(null);
      setActiveShift(null);
      const hours = Math.floor(payload.durationMinutes / 60);
      const mins = payload.durationMinutes % 60;
      setAutoClockOutToast(`You were automatically clocked out after ${hours}h ${mins}m.`);
      // Auto-dismiss toast after 8s
      setTimeout(() => setAutoClockOutToast(null), 8000);
      // Sync global state
      fetchShiftStatus();
      window.dispatchEvent(new Event('global-shift-status-changed'));
    };

    socket.on('attendance:status_changed', handleGlobalUpdate);
    socket.on('attendance:session_warning', handleSessionWarning);
    socket.on('attendance:auto_clocked_out', handleAutoClockOut);
    return () => {
      socket.off('attendance:status_changed', handleGlobalUpdate);
      socket.off('attendance:session_warning', handleSessionWarning);
      socket.off('attendance:auto_clocked_out', handleAutoClockOut);
    };
  }, [socket, fetchShiftStatus]);

  // Background synchronization loop: ensure correct global state every 6s
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchShiftStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchShiftStatus]);

  const toggleShift = async () => {
    console.log('toggleShift triggered. activeShift:', activeShift);
    // Synchronous immediate lock shielding against parallel execution before state commits
    if (isProcessing || isProcessingRef.current) {
      console.log('Already processing, ignoring click.');
      return;
    }
    
    try {
      if (activeShift) {
        console.log('Showing clock-out confirmation...');
        // Simple confirmation for clocking out
        const ok = await confirm('Are you sure you want to clock out for today?', 'End Shift');
        console.log('Clock-out confirmation result:', ok);
        if (!ok) return;

        isProcessingRef.current = true;
        setIsProcessing(true);
        await api.post('/timesheets/out');
        setActiveShift(null);
      } else {
        // CHECK PERSISTENT PERMISSION (USER REQUEST)
        const previouslyAllowed = localStorage.getItem('locationAllowed') === 'true';
        let ok = previouslyAllowed;

        if (!previouslyAllowed) {
          ok = await confirm(
            "We need to verify your location for attendance (On-site vs WFH). Do you allow us to access your location?",
            "Location Permission"
          );
          
          if (ok) {
            localStorage.setItem('locationAllowed', 'true');
          } else {
            await alert("Location access was not granted. You will be marked as WFH by default. You can enable this later to verify on-site attendance.", "Permission Denied");
          }
        }

        isProcessingRef.current = true;
        setIsProcessing(true);
        
        let locationData = {};
        if (ok) {
          try {
            if ("geolocation" in navigator) {
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 10000, 
                  maximumAge: 0
                });
              });
              
              locationData = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              };
            }
          } catch (geoErr) {
            console.warn('Geolocation failed or denied by browser:', geoErr);
          }
        }

        const res = await api.post('/timesheets/in', locationData);
        setActiveShift(res.data.entry);
      }
      
      // Force immediate local context synchronization
      await fetchShiftStatus();

      // Dispatch a global application event to notify sibling views (like Dashboard personal metrics) to immediately re-sync!
      window.dispatchEvent(new Event('global-shift-status-changed'));
      
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to process attendance action.', 'Error');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  // ─── Session warning handlers ──────────────────────────────────────────
  const handleSessionAlive = React.useCallback(() => {
    if (socket) socket.emit('attendance:session_alive');
    setSessionWarning(null);
  }, [socket]);

  const handleSessionClockOut = React.useCallback(async () => {
    setSessionWarning(null);
    try {
      setIsProcessing(true);
      isProcessingRef.current = true;
      await api.post('/timesheets/out');
      setActiveShift(null);
      await fetchShiftStatus();
      window.dispatchEvent(new Event('global-shift-status-changed'));
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to clock out.', 'Error');
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }, [socket, fetchShiftStatus, alert]);

  // Restrict rendering strictly to personnel level employees
  if (!user || user.role !== 'employee') return null;

  const renderStopwatch = () => {
    if (!activeShift || !activeShift.clockIn) {
      return (
        <div className={styles.stopwatchContainer} style={{ opacity: 0.65 }}>
          <span className={styles.stopwatchDotInactive}></span>
          <span className={styles.stopwatchText} style={{ fontVariantNumeric: 'tabular-nums' }}>
            00:00
          </span>
        </div>
      );
    }

    const inTime = new Date(activeShift.clockIn).getTime();
    const nowTime = tickerTime.getTime();
    const elapsedSecs = Math.max(0, Math.floor((nowTime - inTime) / 1000));

    const hrs = Math.floor(elapsedSecs / 3600);
    const mins = Math.floor((elapsedSecs % 3600) / 60);
    const secs = elapsedSecs % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    
    return (
      <div className={styles.stopwatchContainer}>
        <span className={styles.stopwatchDot}></span>
        <span className={styles.stopwatchText} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Session timeout warning modal */}
      {sessionWarning && (
        <SessionTimeoutModal
          payload={sessionWarning}
          onAlive={handleSessionAlive}
          onClockOut={handleSessionClockOut}
        />
      )}

      {/* Auto clock-out toast notification */}
      {autoClockOutToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#111827',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '12px',
          fontSize: '0.875rem',
          fontWeight: 500,
          zIndex: 99999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeInUp 0.3s ease',
        }}>
          <svg width="18" height="18" fill="none" stroke="#f97316" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/>
          </svg>
          {autoClockOutToast}
          <button
            onClick={() => setAutoClockOutToast(null)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', marginLeft: '4px', fontSize: '1rem' }}
          >✕</button>
        </div>
      )}

      <div className={styles.wrapper}>
        {renderStopwatch()}
        <button
          onClick={toggleShift}
          disabled={isProcessing}
          className={activeShift ? styles.clockOutBtn : styles.clockBtn}
        >
          <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={styles.btnText}>
            {isProcessing ? 'Processing...' : activeShift ? 'Clock Out' : 'Clock In'}
          </span>
        </button>
      </div>
    </>
  );
}
