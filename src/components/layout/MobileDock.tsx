"use client";
import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import { useSocket } from '../../hooks/useSocket';
import styles from './mobiledock.module.css';

export default function MobileDock() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const socket = useSocket();

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new Event('sidebar:toggle'));
  };

  const navItems = [
    {
      label: 'Home',
      path: '/dashboard',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      label: 'Clock',
      path: '/timesheets',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      label: 'Slack',
      path: '/chat/slack',
      badge: 0,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    {
      label: 'Tasks',
      path: '/tasks',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    }
  ];

  return (
    <nav className={styles.dockWrapper} aria-label="Mobile Navigation Dock">
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`${styles.dockItem} ${isActive ? styles.active : ''}`}
            data-tooltip={item.label}
          >
            <div className={styles.iconWrapper}>
              {item.icon}
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className={styles.badge}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>
          </Link>
        );
      })}
      <button
        onClick={handleMenuToggle}
        className={styles.dockItem}
        aria-label="Toggle Menu Panel"
        data-tooltip="Menu"
      >
        <div className={styles.iconWrapper}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </div>
      </button>
    </nav>
  );
}
