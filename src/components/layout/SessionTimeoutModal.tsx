"use client";
import React from 'react';
import styles from './SessionTimeoutModal.module.css';

interface SessionWarningPayload {
  minutesIn: number;
  minutesRemaining: number;
  clockIn: string;
}

interface Props {
  payload: SessionWarningPayload;
  onAlive: () => void;
  onClockOut: () => void;
}

export function SessionTimeoutModal({ payload, onAlive, onClockOut }: Props) {
  const { minutesIn, minutesRemaining } = payload;
  const hoursIn = Math.floor(minutesIn / 60);
  const minsIn = minutesIn % 60;
  const hoursLabel = hoursIn > 0 ? `${hoursIn}h ${minsIn}m` : `${minsIn}m`;

  // Countdown timer for "auto clock-out in X min"
  const [countdown, setCountdown] = React.useState(minutesRemaining);
  React.useEffect(() => {
    setCountdown(minutesRemaining);
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 60000); // decrement every minute
    return () => clearInterval(timer);
  }, [minutesRemaining]);

  // Progress arc for the 12h circle (minutesIn out of 720)
  const totalMinutes = 12 * 60;
  const progress = Math.min(minutesIn / totalMinutes, 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className={styles.overlay} onClick={onAlive}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Pulsing icon */}
        <div className={styles.iconRing}>
          <svg className={styles.progressRing} viewBox="0 0 120 120">
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="rgba(249,115,22,0.15)"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="#f97316"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className={styles.clockIcon}>
            <svg width="36" height="36" fill="none" stroke="#f97316" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
          </div>
        </div>

        {/* Text content */}
        <h2 className={styles.title}>Still there?</h2>
        <p className={styles.subtitle}>
          You've been clocked in for <strong>{hoursLabel}</strong>.<br />
          Your session will auto-end in <strong className={styles.countdown}>{countdown} min</strong>.
        </p>

        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className={styles.progressLabels}>
          <span>0h</span>
          <span className={styles.warnLabel}>11h</span>
          <span>12h</span>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.aliveBtn} onClick={onAlive}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Yes, I'm here
          </button>
          <button className={styles.clockOutBtn} onClick={onClockOut}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Clock Out Now
          </button>
        </div>

      </div>
    </div>
  );
}
