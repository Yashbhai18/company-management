import React from 'react';
import styles from './layout.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <div className={styles.leftPanel}>
        <div className={styles.graphicOverlay}>
          <div className={styles.brand}>
            <span className={styles.logoMark}></span>
            <h2>AttendanceTracker</h2>
          </div>
          <div className={styles.quote}>
            <p>"Streamlining your team's time and attendance, beautifully."</p>
          </div>
        </div>
      </div>
      <div className={styles.rightPanel}>
        {children}
      </div>
    </div>
  );
}
