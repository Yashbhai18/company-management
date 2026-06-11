"use client";
import React from 'react';
import styles from './dashboard.module.css';

export default function Loading() {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.loadingHeader}>
        <div className={styles.loadingTitle} />
        <div className={styles.loadingSubtitle} />
      </div>
      
      <div className={styles.loadingGrid}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingCardHeader} />
          <div className={styles.loadingCardBody} />
        </div>
        <div className={styles.loadingCard}>
          <div className={styles.loadingCardHeader} />
          <div className={styles.loadingCardBody} />
        </div>
        <div className={styles.loadingCard}>
          <div className={styles.loadingCardHeader} />
          <div className={styles.loadingCardBody} />
        </div>
      </div>
      
      <div className={styles.loadingTable}>
        <div className={styles.loadingTableHeader} />
        <div className={styles.loadingTableRow} />
        <div className={styles.loadingTableRow} />
        <div className={styles.loadingTableRow} />
      </div>
    </div>
  );
}
