"use client";
import React from 'react';
import api from '../../lib/api';
import styles from './notificationdrawer.module.css';
import { useSocket } from '../../hooks/useSocket';

export interface INotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

const formatTimeAgo = (dateStr: string) => {
  const now = new Date();
  const past = new Date(dateStr);
  const diffMs = now.getTime() - past.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
};

function getNotifIcon(type: string) {
  if (type === 'chat_dm' || type === 'chat_message') return '💬';
  if (type === 'chat_mention') return '📢';
  if (type === 'time_off_request' || type === 'time_off_response') return '📅';
  if (type === 'join_request' || type === 'join_approved' || type === 'join_rejected') return '👤';
  if (type === 'task_assigned') return '📋';
  if (type === 'task_completed') return '✅';
  if (type === 'task_revision') return '⚠️';
  if (type === 'task_stage_changed') return '🔄';
  return '🔔';
}

interface NotificationDrawerProps {
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export default function NotificationDrawer({ isOpen: controlledIsOpen, setIsOpen: controlledSetIsOpen }: NotificationDrawerProps) {
  const [localIsOpen, setLocalIsOpen] = React.useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : localIsOpen;
  const setIsOpen = controlledSetIsOpen !== undefined ? controlledSetIsOpen : setLocalIsOpen;
  const [notifications, setNotifications] = React.useState<INotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  // Request browser Notification permission on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Initial fetch
  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Polling fallback every 30 seconds (socket handles real-time)
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const socket = useSocket();

  // Real-time socket push
  React.useEffect(() => {
    if (!socket) return;

    const handler = (notif?: any) => {
      fetchNotifications();

      // Show browser desktop notification if payload is received and browser tab is unfocused
      if (notif && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const isChatNotif = notif.type === 'chat_message' || notif.type === 'chat_dm';
        const isChatPage = window.location.pathname === '/chat';

        // Prevent duplication with the dedicated chat page handlers
        if (!isChatPage || !isChatNotif) {
          if (!document.hasFocus()) {
            try {
              new Notification(notif.title, {
                body: notif.message,
                tag: `app-notification-${notif._id || Date.now()}`,
                renotify: true
              } as any);
            } catch (err) {
              console.error('Failed to display desktop notification:', err);
            }
          }
        }
      }
    };

    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [socket, fetchNotifications]);

  // Close on outside click
  React.useEffect(() => {
    const handleOutsideClick = () => setIsOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDismiss = async (e: React.MouseEvent, notifId: string, isUnread: boolean) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${notifId}`);
      setNotifications(prev => prev.filter(n => n._id !== notifId));
      if (isUnread) setUnreadCount(c => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (e: React.MouseEvent, notif: INotification) => {
    e.stopPropagation();
    setIsOpen(false);

    if (!notif.read) {
      try {
        await api.post(`/notifications/${notif._id}/read`);
        setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, read: true } : n));
        setUnreadCount(c => Math.max(0, c - 1));
      } catch (err) {
        console.error(err);
      }
    }

    if (notif.actionUrl) {
      window.location.href = notif.actionUrl;
    }
  };

  return (
    <div className={styles.wrapper} onClick={(e) => e.stopPropagation()}>
      <button
        className={styles.bellBtn}
        onClick={() => {
          setIsOpen(!isOpen);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }}
        aria-label="Notifications"
      >
        <svg fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <div className={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {isOpen && (
        <div className={styles.menuPop}>
          <div className={styles.menuHead}>
            <h3 className={styles.headTitle}>Notifications</h3>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className={styles.notifList}>
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  onClick={(e) => handleNotificationClick(e, notif)}
                  className={`${styles.notifItem} ${!notif.read ? styles.unreadItem : ''}`}
                >
                  {!notif.read && <span className={styles.unreadDot}></span>}
                  <div className={styles.notifIcon}>{getNotifIcon(notif.type)}</div>
                  <div className={styles.notifBody}>
                    <div className={styles.itemTitle}>{notif.title}</div>
                    <div className={styles.itemMsg}>{notif.message}</div>
                    <div className={styles.itemMeta}>{formatTimeAgo(notif.createdAt)}</div>
                  </div>
                  <button
                    className={styles.dismissBtn}
                    onClick={(e) => handleDismiss(e, notif._id, !notif.read)}
                    aria-label="Dismiss notification"
                    title="Dismiss"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <div className={styles.emptyContainer}>
                <svg className={styles.emptyIcon} width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 003.832 0m-3.832 0A23.846 23.846 0 014.5 15.892m3.857 1.19a23.848 23.848 0 006.501 0M18.75 13.5v-3a6 6 0 00-12 0v3m12 0a3 3 0 01.45 5.03l-1.35-1.03H6.15l-1.35 1.03a3 3 0 01.45-5.03z" />
                </svg>
                <p className={styles.emptyText}>No notifications yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
