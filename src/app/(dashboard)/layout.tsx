import React from 'react';
import Sidebar from '../../components/layout/Sidebar';
import Header from '../../components/layout/Header';
import styles from './dashboard.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layoutWrapper}>
      <Header />
      <div className={styles.layoutContainer}>
        <React.Suspense fallback={<div style={{ width: '260px' }} />}>
          <Sidebar />
        </React.Suspense>
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </div>
  );
}

