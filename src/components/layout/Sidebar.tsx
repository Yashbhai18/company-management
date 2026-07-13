"use client";
import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';
import { useSocket } from '../../hooks/useSocket';
import styles from './sidebar.module.css';

import { 
  MdDashboard, 
  MdPeople, 
  MdAccessTime, 
  MdEventNote, 
  MdAttachMoney, 
  MdChecklist, 
  MdTimeline, 
  MdLocationOn, 
  MdSecurity, 
  MdSettings, 
  MdLogout 
} from 'react-icons/md';
import { FaSlack } from 'react-icons/fa';

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [isOpenMobile, setIsOpenMobile] = React.useState(false);
  const socket = useSocket();

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

    api.get('/auth/me').then(res => {
      setUser(res.data.user);
      setOrg(res.data.org);
      localStorage.setItem('attendance:user', JSON.stringify(res.data.user));
      localStorage.setItem('attendance:org', JSON.stringify(res.data.org));
    }).catch(err => {
      if (err.response?.status !== 401) {
        console.error('Failed to load user', err);
      }
    });
  }, []);

  React.useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      // Handle non-chat notifications here if needed in the future
    };
    socket.on('notification:new', handleUpdate);
    return () => {
      socket.off('notification:new', handleUpdate);
    };
  }, [socket]);

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
    { label: 'Dashboard', path: '/dashboard', Icon: MdDashboard },
    { label: 'Directory', path: '/people', Icon: MdPeople },
    { label: 'Timesheets', path: '/timesheets', Icon: MdAccessTime },
    { label: 'Time Off', path: '/time-off', Icon: MdEventNote },
    { label: 'Payroll', path: '/salary', Icon: MdAttachMoney, adminOnly: true },
    { label: 'Slack', path: '/chat/slack', Icon: FaSlack },
  ];

  const projectItems = [
    { label: 'Tasks', path: '/tasks', Icon: MdChecklist },
    { label: 'Timeline', path: '/tasks?view=timeline', Icon: MdTimeline },
  ];

  const adminItems = [
    { label: 'Locations', path: '/locations', Icon: MdLocationOn },
    { label: 'Security', path: '/security', Icon: MdSecurity },
    { label: 'Slack Setup', path: '/settings/slack', Icon: MdSettings }
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
          <item.Icon className={styles.icon} />
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
            <MdLogout className={styles.icon} />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
