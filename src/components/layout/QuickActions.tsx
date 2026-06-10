"use client";
import React from 'react';
import api from '../../lib/api';
import styles from './quickactions.module.css';

export default function QuickActions() {
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [myOrgs, setMyOrgs] = React.useState<any[]>([]);
  const [showMenu, setShowMenu] = React.useState(false);
  
  // Create Organization Modal
  const [showOrgModal, setShowOrgModal] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // Fetch identity context
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
      console.error('QuickActions load failed:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Auto-close menu when clicking outside
  React.useEffect(() => {
    const handleOutsideClick = () => setShowMenu(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
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

  // Exclude non-administrative employees from referencing quick controls
  if (!user || user.role === 'employee') return null;

  return (
    <div className={styles.profileDropdownWrapper} onClick={(e) => e.stopPropagation()}>
      <button
        className={styles.profileBtn}
        onClick={() => setShowMenu(!showMenu)}
      >
        <div className={styles.miniAvatar}>
          {user.avatar ? (
            <img src={user.avatar} className={styles.fullImgCover} alt="" />
          ) : (
            user.name?.charAt(0)
          )}
        </div>
        <span>Quick Actions</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={styles.chevronSmall}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {showMenu && (
        <div className={styles.menuPop}>
          <div className={styles.menuHead}>
            <p className={styles.headName}>{user.name}</p>
            <p className={styles.headSub}>{user.email}</p>
          </div>
          <div className={styles.menuDivider} />

          {myOrgs.length > 1 && (
            <>
              <div className={styles.menuGroupLabel}>Switch Organization</div>
              {myOrgs.map((o: any) => {
                if (o.orgId === org?._id) return null;
                return (
                  <button key={o.orgId} onClick={() => handleSwitchOrg(o.orgId)} className={styles.menuItemBtn}>
                    <div className={styles.tinyOrgIcon}>{o.name.charAt(0)}</div>
                    <div className={styles.switchItemText}>
                      <span className={styles.switchName}>{o.name}</span>
                      <span className={styles.switchSlug}>@{o.slug}</span>
                    </div>
                  </button>
                );
              })}
              <div className={styles.menuDivider} />
            </>
          )}

          <button
            onClick={() => { setShowOrgModal(true); setShowMenu(false); }}
            className={styles.menuItemBtn}
          >
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            Add another Org
          </button>
          
          <div className={styles.menuDivider} />
          
          <button onClick={handleLogout} className={styles.menuItemRed}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
            Log Out
          </button>
        </div>
      )}

      {/* MODAL: CREATE ORGANIZATION WITHIN SHARED CONTEXT */}
      {showOrgModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
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
    </div>
  );
}
