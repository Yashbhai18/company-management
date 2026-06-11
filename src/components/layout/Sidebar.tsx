"use client";
import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import styles from './sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [dmUnread, setDmUnread] = React.useState(0);
  const [isOpenMobile, setIsOpenMobile] = React.useState(false);

  React.useEffect(() => {
    const handleToggle = () => setIsOpenMobile(prev => !prev);
    const handleClose = () => setIsOpenMobile(false);
    
    window.addEventListener('sidebar:toggle', handleToggle);
    window.addEventListener('sidebar:close', handleClose);
    
    return () => {
      window.removeEventListener('sidebar:toggle', handleToggle);
      window.removeEventListener('sidebar:close', handleClose);
    };
  }, []);

  React.useEffect(() => {
    setIsOpenMobile(false);
  }, [pathname, searchParams]);
  
  React.useEffect(() => {
    // Load from cache synchronously on client mount to prevent SSR hydration mismatch
    try {
      const cachedUser = localStorage.getItem('attendance:user');
      const cachedOrg = localStorage.getItem('attendance:org');
      if (cachedUser) setUser(JSON.parse(cachedUser));
      if (cachedOrg) setOrg(JSON.parse(cachedOrg));
    } catch {}

    // Fetch the current user and org
    api.get('/auth/me').then(res => {
      setUser(res.data.user);
      setOrg(res.data.org);
      localStorage.setItem('attendance:user', JSON.stringify(res.data.user));
      localStorage.setItem('attendance:org', JSON.stringify(res.data.org));
    }).catch(err => {
      console.error('Failed to load user', err);
    });
    // Fetch unread DM count
    api.get('/chat/conversations').then(res => {
      const total = (res.data as any[]).reduce((acc: number, c: any) => acc + (c.unreadCount || 0), 0);
      setDmUnread(total);
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('attendance:user');
      localStorage.removeItem('attendance:org');
      await api.post('/auth/logout');
      // clear memory token
      const apiModule = await import('../../lib/api');
      apiModule.setAccessToken(null);
      window.location.href = '/';
    } catch (err) {
      localStorage.removeItem('attendance:user');
      localStorage.removeItem('attendance:org');
      console.error(err);
      window.location.href = '/';
    }
  };

  const workforceItems = [
    { label: 'Dashboard', path: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: 'Directory', path: '/people', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { label: 'Timesheets', path: '/timesheets', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Time Off', path: '/time-off', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { label: 'Payroll', path: '/salary', icon: 'M12 8c-2.761 0-5 1.79-5 4s2.239 4 5 4 5 1.79 5 4-2.239 4-5 4m0-16v2m0 12v2m-4-4h8', adminOnly: true },
    { label: 'Chat', path: '/chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', badge: dmUnread },
  ];

  const projectItems = [
    { label: 'Tasks', path: '/tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { label: 'Timeline', path: '/tasks?view=timeline', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  ];

  const adminItems = [
    { label: 'Locations', path: '/locations', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Security', path: '/security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { label: 'Audit Logs', path: '/security?view=audit-logs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2' }
  ];

  const renderNavItems = (items: typeof workforceItems) => {
    return items.map((item) => {
      if ((item as any).adminOnly && (!user || (user.role !== 'admin' && user.role !== 'super_admin'))) {
        return null;
      }
      
      const url = new URL(item.path, 'http://localhost');
      const itemPathname = url.pathname;
      const itemView = url.searchParams.get('view') || '';
      
      const isActive = pathname === itemPathname && (searchParams.get('view') || '') === itemView;
      
      return (
        <Link 
          key={item.path} 
          href={item.path} 
          className={`${styles.navItem} ${isActive ? styles.active : ''}`}
        >
          <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
          </svg>
          {item.label}
          {(item as any).badge > 0 && (
            <span className={styles.navBadge}>{(item as any).badge > 9 ? '9+' : (item as any).badge}</span>
          )}
        </Link>
      );
    });
  };

  return (
    <>
      {isOpenMobile && (
        <div 
          className={styles.backdrop} 
          onClick={() => setIsOpenMobile(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`${styles.sidebar} ${isOpenMobile ? styles.sidebarOpen : ''}`}>
        <nav className={styles.nav}>
          <div className={styles.sectionHeader}>Workforce</div>
          {renderNavItems(workforceItems)}
          
          <div className={styles.sectionHeader}>Projects</div>
          {renderNavItems(projectItems)}
          
          {user && (user.role === 'admin' || user.role === 'super_admin') && (
            <>
              <div className={styles.sectionHeader}>Admin</div>
              {renderNavItems(adminItems)}
            </>
          )}
        </nav>

        <div className={styles.footer}>
          {user && (
            <Link href="/profile" className={styles.userInfoBtn}>
              <div className={styles.avatar}>
                {user.avatar ? <img src={user.avatar} className={styles.fullImgCover} alt="" /> : user.name.charAt(0)}
              </div>
              <div className={styles.userDetails}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{user.role.replace('_', ' ')}</span>
              </div>
            </Link>
          )}
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
