"use client";
import React from 'react';
import Link from 'next/link';
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
  const [searchResults, setSearchResults] = React.useState<any>({ tasks: [], messages: [], holidays: [], timeOff: [], people: [] });
  const [isSearching, setIsSearching] = React.useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  // Create Org Modal States
  const [showOrgModal, setShowOrgModal] = React.useState(false);
  const [isClosingOrg, setIsClosingOrg] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Join Org Modal States (Employee)
  const [showJoinModal, setShowJoinModal] = React.useState(false);
  const [isClosingJoin, setIsClosingJoin] = React.useState(false);
  const [joinSlug, setJoinSlug] = React.useState('');
  const [isJoining, setIsJoining] = React.useState(false);
  const [joinError, setJoinError] = React.useState('');

  const closeOrgModal = () => {
    setIsClosingOrg(true);
    setTimeout(() => {
      setShowOrgModal(false);
      setIsClosingOrg(false);
    }, 250);
  };

  const closeJoinModal = () => {
    setIsClosingJoin(true);
    setTimeout(() => {
      setShowJoinModal(false);
      setIsClosingJoin(false);
    }, 250);
  };

  const fetchContext = React.useCallback(async () => {
    try {
      const [uRes, oRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/my-orgs')
      ]);
      setUser(uRes.data.user);
      setOrg(uRes.data.org);
      setMyOrgs(oRes.data.orgs || []);
      localStorage.setItem('attendance:user', JSON.stringify(uRes.data.user));
      localStorage.setItem('attendance:org', JSON.stringify(uRes.data.org));
    } catch (err) {
      console.error('Header load failed:', err);
    }
  }, []);

  React.useEffect(() => {
    // Load from cache synchronously on client mount to prevent SSR hydration mismatch
    try {
      const cachedUser = localStorage.getItem('attendance:user');
      const cachedOrg = localStorage.getItem('attendance:org');
      if (cachedUser) setUser(JSON.parse(cachedUser));
      if (cachedOrg) setOrg(JSON.parse(cachedOrg));
    } catch {}

    fetchContext();
  }, [fetchContext]);

  // Click outside menus to close
  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      setShowWorkspaceMenu(false);
      setShowUserMenu(false);
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchOverlay(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Debounced Search API effect
  React.useEffect(() => {
    if (!searchVal.trim()) {
      setSearchResults({ tasks: [], messages: [], holidays: [], timeOff: [], people: [] });
      setShowSearchOverlay(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(searchVal)}`);
        setSearchResults(res.data);
        setShowSearchOverlay(true);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchVal]);

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
      closeJoinModal();
      window.location.reload();
    } catch (err: any) {
      setJoinError(err.response?.data?.message || 'Workplace not found. Please verify the Slug ID.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('attendance:user');
      localStorage.removeItem('attendance:org');
      await api.post('/auth/logout');
      const apiModule = await import('../../lib/api');
      apiModule.setAccessToken(null);
      window.location.href = '/';
    } catch (err) {
      localStorage.removeItem('attendance:user');
      localStorage.removeItem('attendance:org');
      window.location.href = '/';
    }
  };

  return (
    <header className={styles.header}>
      {/* Sidebar Mobile Toggle Button */}
      <button
        type="button"
        className={styles.mobileMenuToggle}
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new Event('sidebar:toggle'));
        }}
        aria-label="Toggle Navigation Sidebar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Workspace Selector */}
      <div className={styles.workspaceWrapper} onClick={(e) => { e.stopPropagation(); setShowWorkspaceMenu(!showWorkspaceMenu); setShowUserMenu(false); }}>
        <div className={styles.workspaceLogo}>
          {org ? org.name.charAt(0) : '?'}
        </div>
        <span className={styles.workspaceName}>{org ? org.name : 'Select Workspace'}</span>
        <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className={styles.chevron}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>

        {showWorkspaceMenu && (
          <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dropdownHeader}>My Workspaces</div>
            <div className={styles.orgList}>
              {myOrgs.map((o) => (
                <button
                  key={o.orgId}
                  onClick={() => handleSwitchOrg(o.orgId)}
                  className={`${styles.dropdownItem} ${o.orgId === org?._id ? styles.activeOrg : ''}`}
                >
                  <div className={styles.tinyOrgIcon}>{o.name.charAt(0)}</div>
                  <div className={styles.orgDetails}>
                    <span className={styles.orgNameLabel}>{o.name}</span>
                    <span className={styles.orgSlugLabel}>@{o.slug}</span>
                  </div>
                  {o.orgId === org?._id && (
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className={styles.checkIcon}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            
            <div className={styles.divider} />
            
            {/* Standard employee is restricted from joining other organizations, but has JOIN shortcut */}
            {user?.role === 'employee' ? (
              <button 
                className={styles.addOrgBtn}
                onClick={() => { setShowJoinModal(true); setShowWorkspaceMenu(false); }}
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={styles.btnIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-9-3.75h.008v.008H3.75v-.008zm.008 3h-.008v-.008H3.75v.008zm0 3h-.008v-.008H3.75v.008zm0 3h-.008v-.008H3.75v.008zm3-6h-.008v-.008h.008v.008zm0 3h-.008v-.008h.008v.008zm0 3h-.008v-.008h.008v.008zm3-6h-.008v-.008h.008v.008zm0 3h-.008v-.008h.008v.008zm3-6h-.008v-.008h.008v.008zm0 3h-.008v-.008h.008v.008z" />
                </svg>
                Join Organization
              </button>
            ) : (
              <button 
                className={styles.addOrgBtn}
                onClick={() => { setShowOrgModal(true); setShowWorkspaceMenu(false); }}
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={styles.btnIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create new Org
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.dividerVertical} />

      {/* Header Actions */}
      <div className={styles.headerActions}>
        {/* Global Punch Clock Controls */}
        <ClockInOutButton />

        <div className={styles.dividerVertical} />

        {/* Global Sitewide Search Container */}
        <div className={styles.searchContainer} ref={searchContainerRef}>
          <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search sitewide... (Ctrl+K)" 
            className={styles.searchInput}
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onFocus={() => { if (searchVal.trim()) setShowSearchOverlay(true); }}
          />

          {/* Floating Glassmorphic Search Results Overlay */}
          {showSearchOverlay && (
            <div className={styles.searchOverlay}>
              {isSearching ? (
                <div className={styles.searchLoader}>
                  <div className={styles.spinner}></div>
                  Searching corporate records...
                </div>
              ) : (
                (() => {
                  const hasResults = Object.values(searchResults).some((arr: any) => arr.length > 0);
                  if (!hasResults) {
                    return <div className={styles.searchNoResults}>No records matched "{searchVal}"</div>;
                  }
                  return (
                    <div className={styles.searchResultsContainer}>
                      {/* Tasks Section */}
                      {searchResults.tasks?.length > 0 && (
                        <div className={styles.searchCategory}>
                          <div className={styles.searchCategoryTitle}>Tasks ({searchResults.tasks.length})</div>
                          {searchResults.tasks.map((task: any) => (
                            <Link 
                              key={task._id} 
                              href={`/tasks?id=${task._id}`} 
                              onClick={() => { setShowSearchOverlay(false); setSearchVal(''); }} 
                              className={styles.searchResultItem}
                            >
                              <span className={styles.searchResultIcon}>📋</span>
                              <div className={styles.searchResultMeta}>
                                <span className={styles.searchResultName}>{task.title}</span>
                                <span className={styles.searchResultDesc}>{task.description || 'No description'}</span>
                              </div>
                              <span className={`${styles.searchResultBadge} ${styles[`status_${task.status.toLowerCase()}`]}`}>
                                {task.status}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Messages Section */}
                      {searchResults.messages?.length > 0 && (
                        <div className={styles.searchCategory}>
                          <div className={styles.searchCategoryTitle}>Chat Messages ({searchResults.messages.length})</div>
                          {searchResults.messages.map((msg: any) => (
                            <Link 
                              key={msg._id} 
                              href={`/chat?user=${msg.senderId?._id || ''}`} 
                              onClick={() => { setShowSearchOverlay(false); setSearchVal(''); }} 
                              className={styles.searchResultItem}
                            >
                              <span className={styles.searchResultIcon}>💬</span>
                              <div className={styles.searchResultMeta}>
                                <span className={styles.searchResultName}>{msg.senderId?.name || 'User'}</span>
                                <span className={styles.searchResultDesc}>{msg.content}</span>
                              </div>
                              <span className={styles.searchResultTime}>
                                {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Holidays & Leave Section */}
                      {(searchResults.holidays?.length > 0 || searchResults.timeOff?.length > 0) && (
                        <div className={styles.searchCategory}>
                          <div className={styles.searchCategoryTitle}>Holidays & Leave</div>
                          {searchResults.holidays?.map((h: any) => (
                            <Link 
                              key={h._id} 
                              href="/time-off" 
                              onClick={() => { setShowSearchOverlay(false); setSearchVal(''); }} 
                              className={styles.searchResultItem}
                            >
                              <span className={styles.searchResultIcon}>🎉</span>
                              <div className={styles.searchResultMeta}>
                                <span className={styles.searchResultName}>{h.description}</span>
                                <span className={styles.searchResultDesc}>National Holiday • {new Date(h.startDate).toLocaleDateString()}</span>
                              </div>
                            </Link>
                          ))}
                          {searchResults.timeOff?.map((to: any) => (
                            <Link 
                              key={to._id} 
                              href="/time-off" 
                              onClick={() => { setShowSearchOverlay(false); setSearchVal(''); }} 
                              className={styles.searchResultItem}
                            >
                              <span className={styles.searchResultIcon}>✈️</span>
                              <div className={styles.searchResultMeta}>
                                <span className={styles.searchResultName}>{to.userId?.name || 'Personal Leave'}</span>
                                <span className={styles.searchResultDesc}>Leave Request: "{to.reason}"</span>
                              </div>
                              <span className={`${styles.searchResultBadge} ${styles[`status_${to.status.toLowerCase()}`]}`}>
                                {to.status}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* People Roster Section */}
                      {searchResults.people?.length > 0 && (
                        <div className={styles.searchCategory}>
                          <div className={styles.searchCategoryTitle}>Employees ({searchResults.people.length})</div>
                          {searchResults.people.map((p: any) => (
                            <Link 
                              key={p._id} 
                              href={`/profile?id=${p._id}`} 
                              onClick={() => { setShowSearchOverlay(false); setSearchVal(''); }} 
                              className={styles.searchResultItem}
                            >
                              <div className={styles.searchResultAvatar}>
                                {p.avatar ? <img src={p.avatar} className={styles.avatarImg} alt="" /> : p.name.charAt(0)}
                              </div>
                              <div className={styles.searchResultMeta}>
                                <span className={styles.searchResultName}>{p.name}</span>
                                <span className={styles.searchResultDesc}>{p.email} • {p.role}</span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </div>

        {/* Dynamic Global Notification Drawer Component */}
        <div className={styles.alertsContainer}>
          <NotificationDrawer />
        </div>

        {/* User Menu Trigger */}
        <div className={styles.userMenuWrapper} onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); setShowWorkspaceMenu(false); }}>
          <div className={styles.userAvatar}>
            {user && user.avatar ? (
              <img src={user.avatar} className={styles.avatarImg} alt="" />
            ) : (
              user ? user.name.charAt(0) : '?'
            )}
          </div>
          <span className={styles.userName}>{user ? user.name : 'Loading...'}</span>
          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className={styles.chevron}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>

          {showUserMenu && (
            <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.userDropdownHeader}>
                <div className={styles.userDropdownName}>{user?.name}</div>
                <div className={styles.userDropdownEmail}>{user?.email}</div>
              </div>
              <div className={styles.divider} />
              
              <Link href="/profile" className={styles.dropdownLink} onClick={() => setShowUserMenu(false)}>My Profile</Link>
              <Link href="/security" className={styles.dropdownLink} onClick={() => setShowUserMenu(false)}>Security Settings</Link>
              
              <div className={styles.divider} />
              
              <button onClick={handleLogout} className={styles.logoutBtn}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Org Modal */}
      {showOrgModal && (
        <div className={`${styles.modalBackdrop} ${isClosingOrg ? 'closingBackdrop' : ''}`} onClick={closeOrgModal}>
          <div className={`${styles.modalContent} ${isClosingOrg ? 'closingContent' : ''}`} onClick={(e) => e.stopPropagation()}>
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
                  onClick={closeOrgModal}
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
        <div className={`${styles.modalBackdrop} ${isClosingJoin ? 'closingBackdrop' : ''}`} onClick={closeJoinModal}>
          <div className={`${styles.modalContent} ${isClosingJoin ? 'closingContent' : ''}`} onClick={(e) => e.stopPropagation()}>
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
                  onClick={closeJoinModal}
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
