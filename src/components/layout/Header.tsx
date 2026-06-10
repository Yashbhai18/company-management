"use client";
import React from 'react';
import api from '../../lib/api';
import styles from './header.module.css';
import NotificationDrawer from './NotificationDrawer';
import ClockInOutButton from './ClockInOutButton';
import { useDialog } from '../ui/DialogProvider';

export default function Header() {
  const { alert } = useDialog();
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [myOrgs, setMyOrgs] = React.useState<any[]>([]);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [searchVal, setSearchVal] = React.useState('');

  // Create Org Modal States
  const [showOrgModal, setShowOrgModal] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Join Org Modal States (Employee)
  const [showJoinModal, setShowJoinModal] = React.useState(false);
  const [joinSlug, setJoinSlug] = React.useState('');
  const [isJoining, setIsJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState('');

  const fetchContext = React.useCallback(async () => {
    try {
      const [uRes, oRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/my-orgs')
      ]);
      setUser(uRes.data.user);
      setOrg(uRes.data.org);
      setMyOrgs(oRes.data.orgs || []);
    } catch (err) {
      console.error('Header load failed:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Click outside menus to close
  React.useEffect(() => {
    const handleOutsideClick = () => {
      setShowWorkspaceMenu(false);
      setShowUserMenu(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Keyboard shortcut Ctrl+K to focus search input
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSwitchOrg = async (targetOrgId: string) => {
    try {
      const res = await api.post('/auth/switch-org', { orgId: targetOrgId });
      const apiModule = await import('../../lib/api');
      apiModule.setAccessToken(res.data.accessToken);
      window.location.reload();
    } catch (err) {
      console.error('Switch Failed', err);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setErrorMsg('');
    try {
      const res = await api.post('/auth/expand-org', {
        orgName: newOrgName,
        slug: newSlug
      });
      const { accessToken } = res.data;
      const apiModule = await import('../../lib/api');
      apiModule.setAccessToken(accessToken);
      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to create additional organization.');
      setIsCreating(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsJoining(true);
    setJoinError('');
    try {
      const res = await api.post('/auth/join-by-slug', { slug: joinSlug.trim() });
      await alert(res.data.message || 'Join request sent successfully! Waiting for organization approval.', 'Success');
      setJoinSlug('');
      setShowJoinModal(false);
      window.location.reload();
    } catch (err: any) {
      setJoinError(err.response?.data?.message || 'Workplace not found. Please verify the Slug ID.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      const apiModule = await import('../../lib/api');
      apiModule.setAccessToken(null);
      window.location.href = '/';
    } catch (err) {
      window.location.href = '/';
    }
  };

  return (
    <header className={styles.header}>
      {/* Workspace Switcher */}
      <div 
        className={styles.workspaceWrapper} 
        onClick={(e) => { e.stopPropagation(); setShowWorkspaceMenu(!showWorkspaceMenu); setShowUserMenu(false); }}
      >
        <div className={styles.workspaceLogo}>
          {org ? org.name.charAt(0) : 'A'}
        </div>
        <span className={styles.workspaceName}>
          {org ? org.name : 'Antigravity Lab'}
        </span>
        <svg viewBox="0 0 24 24" className={styles.chevron} fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>

        {showWorkspaceMenu && (
          <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dropdownHeader}>Switch Workspace</div>
            <div className={styles.orgList}>
              {myOrgs.map((o: any) => (
                <button 
                  key={o.orgId} 
                  className={`${styles.dropdownItem} ${o.orgId === org?._id ? styles.activeOrg : ''}`}
                  onClick={() => o.orgId !== org?._id && handleSwitchOrg(o.orgId)}
                >
                  <div className={styles.tinyOrgIcon}>{o.name.charAt(0)}</div>
                  <div className={styles.orgDetails}>
                    <div className={styles.orgNameLabel}>{o.name}</div>
                    <div className={styles.orgSlugLabel}>@{o.slug}</div>
                  </div>
                  {o.orgId === org?._id && (
                    <svg viewBox="0 0 20 20" fill="currentColor" className={styles.checkIcon}>
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            
            <div className={styles.divider} />
            {user?.role === 'employee' ? (
              <button 
                className={styles.addOrgBtn}
                onClick={() => { setShowJoinModal(true); setShowWorkspaceMenu(false); }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className={styles.btnIcon}>
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Join Organization
              </button>
            ) : (
              <button 
                className={styles.addOrgBtn}
                onClick={() => { setShowOrgModal(true); setShowWorkspaceMenu(false); }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className={styles.btnIcon}>
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add another Org
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.dividerVertical} />

      {/* Search Bar */}
      <div className={styles.searchContainer}>
        <svg viewBox="0 0 24 24" className={styles.searchIcon} fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input 
          ref={searchInputRef}
          type="text" 
          placeholder="Search Bar: Ctrl+K" 
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Header Actions */}
      <div className={styles.headerActions}>
        <ClockInOutButton />
        <NotificationDrawer />
        
        {/* Alerts / System status */}
        <div className={styles.alertsContainer}>
          <button className={styles.alertsBtn} title="System Alerts">
            <span className={styles.alertsLabel}>Alerts</span>
            <span className={styles.alertsIndicator}></span>
          </button>
        </div>

        <div className={styles.dividerVertical} />

        {/* User Profile Menu */}
        <div 
          className={styles.userMenuWrapper}
          onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); setShowWorkspaceMenu(false); }}
        >
          <div className={styles.userAvatar}>
            {user?.avatar ? <img src={user.avatar} alt="" className={styles.avatarImg} /> : user?.name?.charAt(0) || 'U'}
          </div>
          <span className={styles.userName}>
            {user?.name || 'User Name'}
          </span>
          <svg viewBox="0 0 24 24" className={styles.chevron} fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>

          {showUserMenu && (
            <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.userDropdownHeader}>
                <div className={styles.userDropdownName}>{user?.name}</div>
                <div className={styles.userDropdownEmail}>{user?.email}</div>
              </div>
              <div className={styles.divider} />
              <a href="/profile" className={styles.dropdownLink}>
                👤 View Profile
              </a>
              <div className={styles.divider} />
              <button onClick={handleLogout} className={styles.logoutBtn}>
                🚪 Log Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Org Modal */}
      {showOrgModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowOrgModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Expand Your Network</h2>
            <p className={styles.modalDesc}>Build an independent new corporate architecture.</p>

            {errorMsg && <div className={styles.alertError}>{errorMsg}</div>}

            <form onSubmit={handleCreateOrg} className={styles.form}>
              <div className={styles.field}>
                <label>New Organization Name</label>
                <input 
                  required 
                  placeholder="e.g. Antigravity Labs" 
                  value={newOrgName} 
                  onChange={e => setNewOrgName(e.target.value)} 
                />
              </div>
              <div className={styles.field}>
                <label>Organization Slug (URL prefix)</label>
                <input 
                  required 
                  placeholder="antigravity-labs" 
                  value={newSlug} 
                  onChange={e => setNewSlug(e.target.value)} 
                />
              </div>

              <div className={styles.modalFooter}>
                <button 
                  type="button" 
                  className={styles.cancelBtn} 
                  onClick={() => setShowOrgModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isCreating} 
                  className={styles.confirmBtn}
                >
                  {isCreating ? 'Creating...' : 'Create & Launch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Org Modal */}
      {showJoinModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowJoinModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Join an Organization</h2>
            <p className={styles.modalDesc}>Enter the Organization Slug / ID below to instantly link your account and register as a member.</p>

            {joinError && <div className={styles.alertError}>{joinError}</div>}

            <form onSubmit={handleJoinOrg} className={styles.form}>
              <div className={styles.field}>
                <label>Organization Slug / ID</label>
                <input 
                  required 
                  placeholder="e.g. Kofi or antigravity-labs" 
                  value={joinSlug} 
                  onChange={e => setJoinSlug(e.target.value)} 
                />
              </div>

              <div className={styles.modalFooter}>
                <button 
                  type="button" 
                  className={styles.cancelBtn} 
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isJoining} 
                  className={styles.confirmBtn}
                >
                  {isJoining ? 'Joining Workspace...' : 'Join Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
