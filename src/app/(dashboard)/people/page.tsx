"use client";
import React from 'react';
import Link from 'next/link';
import api from '../../../lib/api';
import styles from './page.module.css';
import { PREDEFINED_DEPARTMENTS } from '../../../lib/departments';
import QuickActions from '../../../components/layout/QuickActions';
import NotificationDrawer from '../../../components/layout/NotificationDrawer';
import { useDialog } from '../../../components/ui/DialogProvider';
import CustomSelect from '../../../components/ui/CustomSelect';

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  avatar?: string;
  // Extended profile variables
  username?: string;
  department?: string;
  countryCode?: string;
  phone?: string;
  inviteToken?: string | null;
}

const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);

export default function PeoplePage() {
  const { alert, confirm } = useDialog();
  const [users, setUsers] = React.useState<UserRecord[]>([]);
  const [requests, setRequests] = React.useState<any[]>([]);
  const [org, setOrg] = React.useState<any>(null);
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);

  const closeModalWithAnim = () => {
    setIsClosing(true);
    setTimeout(() => {
      resetForm();
      setIsClosing(false);
    }, 250);
  };
  
  // Expanded row matrix state
  const [expandedUserId, setExpandedUserId] = React.useState<string | null>(null);
  
  // Display Picture (DP) Lightbox State
  const [zoomAvatarUrl, setZoomAvatarUrl] = React.useState<string | null>(null);
  const [zoomAvatarName, setZoomAvatarName] = React.useState<string>('');
  const [zoomAvatarInitial, setZoomAvatarInitial] = React.useState<string>('');
  const [isZoomOpen, setIsZoomOpen] = React.useState(false);
  
  // Form states
  const [inviteName, setInviteName] = React.useState('');
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<'admin'|'employee'>('employee');
  const [inviteDeptSelect, setInviteDeptSelect] = React.useState('');
  const [inviteCustomDept, setInviteCustomDept] = React.useState('');
  
  // Holistic Roster Inline Edit states
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editUsername, setEditUsername] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editCountryCode, setEditCountryCode] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editRole, setEditRole] = React.useState('');
  const [editDeptSelect, setEditDeptSelect] = React.useState('');
  const [editDeptCustom, setEditDeptCustom] = React.useState('');
  
  // Post-creation states
  const [generatedLink, setGeneratedLink] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      const [uResp, reqResp, meResp] = await Promise.all([
        api.get('/users'),
        api.get('/auth/join-requests'),
        api.get('/auth/me')
      ]);
      setUsers(uResp.data.users || []);
      setRequests(reqResp.data.requests || []);
      setOrg(meResp.data.org);
      setCurrentUser(meResp.data.user);
    } catch (err) {
      console.error('Roster/Request/Org sync error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // INSTANT REFRESH ENGINE: Synchronize both personnel lists and submission requests every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleResolveRequest = async (requestId: string, resolution: 'approved' | 'rejected') => {
    try {
      await api.post('/auth/resolve-join-request', { requestId, resolution });
      // Silent instant refresh
      fetchData();
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to process request.');
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setGeneratedLink('');
    setInviteName('');
    setInviteEmail('');
    setInviteRole('employee');
    setInviteDeptSelect('');
    setInviteCustomDept('');
    setIsCopied(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalDept = inviteDeptSelect;
    if (inviteDeptSelect === 'OTHER') {
      if (!inviteCustomDept.trim()) {
        await alert('Please enter a custom department name.');
        return;
      }
      finalDept = inviteCustomDept.trim();
    }

    if (inviteRole === 'employee' && !finalDept) {
      await alert('Department selection is mandatory for employees.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/invite', {
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
        department: finalDept
      });
      
      const token = res.data.user.inviteToken;
      const link = `${window.location.origin}/invite/${token}`;
      setGeneratedLink(link);
      
      fetchData();
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Invite Generation Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copyDrawerInviteLink = async (u: UserRecord) => {
    if (!u.inviteToken) {
      await alert('Invite link cannot be generated: no active token found for this pending user.');
      return;
    }
    const link = `${window.location.origin}/invite/${u.inviteToken}`;
    navigator.clipboard.writeText(link);
    await alert('Invitation link successfully copied to clipboard!');
  };

  const handleDeleteMember = async (userRecord: UserRecord) => {
    const confirmStr = userRecord.isActive
      ? `ARE YOU ABSOLUTELY SURE?\nThis will completely revoke ${userRecord.name}'s workspace credentials and purge their profile from this organization.`
      : `Cancel invitation for ${userRecord.name}?\nThis will revoke the pending invite token and remove the entry from your roster.`;
      
    if (!await confirm(confirmStr, 'Delete Member')) return;

    try {
      await api.delete(`/users/${userRecord._id}`);
      await alert('Successful: Entry has been removed from the workspace.');
      
      // Close expanded view if current active target is deleted
      if (expandedUserId === userRecord._id) {
        setExpandedUserId(null);
      }

      fetchData();
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to process member deletion.');
    }
  };
  const handleOpenZoom = (u: UserRecord) => {
    setZoomAvatarUrl(u.avatar || null);
    setZoomAvatarName(u.name);
    setZoomAvatarInitial(u.name.charAt(0).toUpperCase());
    setIsZoomOpen(true);
  };

  const handleCloseZoom = () => {
    setIsZoomOpen(false);
    setZoomAvatarUrl(null);
  };

  const handleStartEdit = (u: UserRecord) => {
    setEditingUserId(u._id);
    setEditName(u.name || '');
    setEditUsername(u.username || '');
    setEditEmail(u.email || '');
    setEditCountryCode(u.countryCode || '+91');
    setEditPhone(u.phone || '');
    setEditRole(u.role || 'employee');

    const cur = u.department || '';
    const customOrgsDepts = org?.departments || [];
    const allDepts = [...PREDEFINED_DEPARTMENTS, ...customOrgsDepts];
    const isPreset = allDepts.some(d => d.toLowerCase() === cur.toLowerCase());
    
    if (isPreset) {
      const match = allDepts.find(d => d.toLowerCase() === cur.toLowerCase());
      setEditDeptSelect(match || cur);
      setEditDeptCustom('');
    } else {
      setEditDeptSelect(cur ? 'OTHER' : '');
      setEditDeptCustom(cur);
    }
  };

  const openSalarySheet = (u: UserRecord) => {
    const month = getCurrentMonthKey();
    window.open(`/salary?userId=${u._id}&month=${month}`, '_blank', 'noopener,noreferrer');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, userId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveUser(userId);
    }
  };

  const handleSaveUser = async (userId: string) => {
    if (!editName.trim()) {
      await alert('Display name cannot be empty.');
      return;
    }
    if (!editEmail.trim()) {
      await alert('Email address cannot be empty.');
      return;
    }

    let finalDept = editDeptSelect;
    if (editDeptSelect === 'OTHER') {
      if (!editDeptCustom.trim()) {
        await alert('Please enter custom department name.');
        return;
      }
      finalDept = editDeptCustom.trim();
    }

    if (editRole === 'employee' && (!finalDept || !finalDept.trim())) {
      await alert('Department selection is required for employee roles.');
      return;
    }

    try {
      await api.patch(`/users/${userId}`, {
        name: editName.trim(),
        username: editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim(),
        countryCode: editCountryCode,
        role: editRole,
        department: finalDept.trim()
      });
      
      await alert('Member profiles synchronized successfully!', 'Success');
      setEditingUserId(null);
      fetchData();
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed synchronizing database profiles.');
    }
  };
  const customOrgsDepts = org?.departments || [];
  const mergedDepartments = Array.from(new Set([...PREDEFINED_DEPARTMENTS, ...customOrgsDepts]));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Team Members</h1>
          <p className={styles.sub}>{currentUser?.role === 'employee' ? 'Directory of all organization personnel.' : 'Manage employees and access control.'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {currentUser?.role !== 'employee' && (
            <button onClick={() => setShowModal(true)} className={styles.inviteBtn}>
              + Add Person
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className={styles.loaderContainer}><div className={styles.loader}></div></div>
      ) : (
        <>
          {/* PENDING REQUESTS QUEUE CARD */}
          {currentUser?.role !== 'employee' && requests.filter(r => r.status === 'pending').length > 0 && (
            <div style={{ marginBottom: '2.5rem', background: 'var(--canvas-soft)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 650, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '20px', height: '20px', color: 'var(--primary)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                Pending Joining Requests 
                <span style={{ background: 'rgba(255, 79, 0, 0.1)', color: 'var(--primary)', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: 700 }}>
                  {requests.filter(r => r.status === 'pending').length}
                </span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {requests.filter(r => r.status === 'pending').map((req) => (
                  <div 
                    key={req._id} 
                    style={{ 
                      background: 'var(--canvas)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '12px', 
                      padding: '1rem 1.25rem', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '40px', height: '40px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--on-primary)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        {req.userId?.avatar ? <img src={req.userId.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : req.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-color)', fontWeight: 600, fontSize: '0.95rem' }}>{req.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{req.email}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button 
                        onClick={() => handleResolveRequest(req._id, 'approved')} 
                        style={{ 
                          background: '#16a34a', 
                          color: '#fff', 
                          border: 'none', 
                          padding: '0.5rem 1rem', 
                          borderRadius: '8px', 
                          fontWeight: 700, 
                          cursor: 'pointer', 
                          fontSize: '0.85rem',
                          boxShadow: '0 2px 6px rgba(22,163,74,0.2)'
                        }}
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleResolveRequest(req._id, 'rejected')} 
                        style={{ 
                          background: 'rgba(239, 68, 68, 0.08)', 
                          color: '#ef4444', 
                          border: '1px solid rgba(239, 68, 68, 0.15)', 
                          padding: '0.5rem 1rem', 
                          borderRadius: '8px', 
                          fontWeight: 600, 
                          cursor: 'pointer', 
                          fontSize: '0.85rem' 
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isExpanded = expandedUserId === u._id;
                  return (
                    <React.Fragment key={u._id}>
                      <tr 
                        className={`${styles.clickableRow} ${isExpanded ? styles.expandedRow : ''}`}
                        onClick={() => setExpandedUserId(isExpanded ? null : u._id)}
                        title={`Click to toggle details for ${u.name}`}
                      >
                        <td>
                          <div className={styles.userInfo}>
                            <button 
                              type="button"
                              className={styles.avatarTriggerBtn}
                              onClick={(e) => {
                                e.stopPropagation(); // Safeguard: prevents toggling the row
                                handleOpenZoom(u);
                              }}
                              title={`Click to view display picture of ${u.name}`}
                            >
                              <div className={styles.avatar}>
                                {u.avatar ? (
                                  <img 
                                    src={u.avatar} 
                                    alt="" 
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                                  />
                                ) : (
                                  u.name.charAt(0)
                                )}
                              </div>
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div className={styles.primaryText}>{u.name}</div>
                              <div className={styles.emailText}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.capitalize}>{u.role.replace('_', ' ')}</td>
                        <td>
                          <span className={u.isActive ? styles.badgeActive : styles.badgePending}>
                            {u.isActive ? 'Active' : 'Pending Invite'}
                          </span>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr className={styles.expandedRow}>
                          <td colSpan={3} className={styles.drawerTd}>
                            <div className={styles.drawerContent}>
                              {u.isActive ? (
                                /* ACTIVE MEMBER DETAILED PROFILE GRID */
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div className={styles.detailGrid} style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Display Name</span>
                                      {editingUserId === u._id ? (
                                        <input 
                                          className={styles.inlineInput}
                                          value={editName}
                                          onChange={e => setEditName(e.target.value)}
                                          placeholder="e.g. Shan"
                                          onKeyDown={e => handleEditKeyDown(e, u._id)}
                                        />
                                      ) : (
                                        <span className={styles.detailValue}>{u.name}</span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Username</span>
                                      {editingUserId === u._id ? (
                                        <input 
                                          className={styles.inlineInput}
                                          value={editUsername}
                                          onChange={e => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                          placeholder="e.g. shanna"
                                          onKeyDown={e => handleEditKeyDown(e, u._id)}
                                        />
                                      ) : (
                                        <span className={styles.detailValue}>
                                          {u.username ? <span className={styles.atText}>@{u.username}</span> : <em style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Not set</em>}
                                        </span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Email Address</span>
                                      {editingUserId === u._id ? (
                                        <input 
                                          className={styles.inlineInput}
                                          value={editEmail}
                                          onChange={e => setEditEmail(e.target.value)}
                                          placeholder="e.g. shan@gmail.com"
                                          onKeyDown={e => handleEditKeyDown(e, u._id)}
                                        />
                                      ) : (
                                        <span className={styles.detailValue}>{u.email}</span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Workspace Phone</span>
                                      {editingUserId === u._id ? (
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                          <input 
                                            className={styles.inlineInput}
                                            style={{ width: '65px', flexShrink: 0 }}
                                            value={editCountryCode}
                                            onChange={e => setEditCountryCode(e.target.value)}
                                            placeholder="+91"
                                            onKeyDown={e => handleEditKeyDown(e, u._id)}
                                          />
                                          <input 
                                            className={styles.inlineInput}
                                            value={editPhone}
                                            onChange={e => setEditPhone(e.target.value)}
                                            placeholder="Phone No."
                                            onKeyDown={e => handleEditKeyDown(e, u._id)}
                                          />
                                        </div>
                                      ) : (
                                        <span className={styles.detailValue}>
                                          {u.phone ? `${u.countryCode || ''} ${u.phone}` : <em style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Not set</em>}
                                        </span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Department</span>
                                      {editingUserId === u._id ? (
                                        <div style={{ width: '100%', maxWidth: '220px' }}>
                                          <CustomSelect 
                                            variant="small"
                                            value={editDeptSelect} 
                                            onChange={setEditDeptSelect}
                                            options={[
                                              ...mergedDepartments.map(d => ({ value: d, label: d })),
                                              { value: 'OTHER', label: 'Other...' }
                                            ]}
                                            placeholder="-- Select --"
                                          />
                                          {editDeptSelect === 'OTHER' && (
                                            <input 
                                              className={styles.inlineInput}
                                              style={{ marginTop: '0.4rem', width: '100%' }}
                                              placeholder="Custom name..."
                                              value={editDeptCustom} 
                                              onChange={e => setEditDeptCustom(e.target.value)}
                                              maxLength={50}
                                              onKeyDown={e => handleEditKeyDown(e, u._id)}
                                            />
                                          )}
                                        </div>
                                      ) : (
                                        <span className={styles.detailValue}>{u.department || 'Unassigned'}</span>
                                      )}
                                    </div>
                                    <div className={styles.detailItem}>
                                      <span className={styles.detailLabel}>Workspace Role</span>
                                      {editingUserId === u._id ? (
                                        <div style={{ width: '100%', maxWidth: '220px' }}>
                                          <CustomSelect 
                                            variant="small"
                                            value={editRole}
                                            onChange={setEditRole}
                                            options={[
                                              { value: 'employee', label: 'Employee' },
                                              { value: 'admin', label: 'Admin' }
                                            ]}
                                          />
                                        </div>
                                      ) : (
                                        <span className={`${styles.detailValue} ${styles.capitalize}`}>{u.role.replace('_', ' ')}</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div style={{ marginLeft: '2rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                    {editingUserId === u._id ? (
                                      <>
                                        <button 
                                          className={styles.inlineSaveBtn}
                                          onClick={() => handleSaveUser(u._id)}
                                        >
                                          Save
                                        </button>
                                        <button 
                                          className={styles.inlineCancelBtn}
                                          onClick={() => setEditingUserId(null)}
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : currentUser?.role === 'employee' ? (
                                      <div className={styles.shortcutGroup}>
                                        <Link 
                                          href={`/chat?dm=${u._id}`}
                                          className={`${styles.shortcutBtn} ${styles.dmBtn}`}
                                          title={`Message ${u.name}`}
                                        >
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 6 6 0 001.942-3.477C3.005 15.393 2 13.8 2 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                          </svg>
                                          Message
                                        </Link>
                                        
                                        <a 
                                          href={`mailto:${u.email}`}
                                          className={`${styles.shortcutBtn} ${styles.emailBtn}`}
                                          title={`Email ${u.name}`}
                                        >
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                          </svg>
                                          Email
                                        </a>

                                        {u.phone ? (
                                          <a 
                                            href={`tel:${u.countryCode || ''}${u.phone}`}
                                            className={`${styles.shortcutBtn} ${styles.callBtn}`}
                                            title={`Call ${u.name}`}
                                          >
                                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.824-1.502-5.184-3.86-6.685-6.686l1.294-.97a1.125 1.125 0 00.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                                            </svg>
                                            Call
                                          </a>
                                        ) : (
                                          <button 
                                            disabled
                                            className={`${styles.shortcutBtn} ${styles.disabledShortcutBtn}`}
                                            title="Phone number not set"
                                          >
                                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.824-1.502-5.184-3.86-6.685-6.686l1.294-.97a1.125 1.125 0 00.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                                            </svg>
                                            No Number
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <>
                                        <button 
                                          className={styles.drawerSalaryBtn}
                                          onClick={() => openSalarySheet(u)}
                                        >
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.214.172a3.75 3.75 0 005.15 0 .75.75 0 011.06 1.06 5.25 5.25 0 01-7.21 0M12 6H9.75M12 6a3.75 3.75 0 100 7.5h.75" /></svg>
                                          Salary Sheet
                                        </button>
                                        <button 
                                          className={styles.inlineEditBtn}
                                          onClick={() => handleStartEdit(u)}
                                        >
                                          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                          Edit Details
                                        </button>
                                        <button 
                                          className={styles.drawerDeleteIconBtn}
                                          onClick={() => handleDeleteMember(u)}
                                          title="Delete Member Profile"
                                        >
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            <line x1="10" y1="11" x2="10" y2="17"></line>
                                            <line x1="14" y1="11" x2="14" y2="17"></line>
                                          </svg>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                /* PENDING INVITE DRAWER SYSTEM */
                                <div className={styles.pendingInviteDrawer}>
                                  <div className={styles.pendingLeft}>
                                    <h4>{u.name}</h4>
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Email: {u.email} • Setup Pending</small>
                                  </div>
                                  <div className={styles.inviteActionGroup}>
                                    {u.inviteToken && (
                                      <button 
                                        className={styles.drawerCopyBtn}
                                        onClick={() => copyDrawerInviteLink(u)}
                                      >
                                        <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" /></svg>
                                        Copy Invite Link
                                      </button>
                                    )}
                                    <button 
                                      className={styles.drawerDeleteBtn}
                                      onClick={() => handleDeleteMember(u)}
                                    >
                                      <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                      Delete Invite / Member
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* HISTORICAL AFFILIATION LOGS PANEL */}
          {requests.filter(r => r.status !== 'pending').length > 0 && (
            <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
              <h3 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px', marginRight: '6px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Join History & Logs
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {requests.filter(r => r.status !== 'pending').map((req) => (
                  <div 
                    key={req._id}
                    style={{ 
                      background: 'var(--container-bg)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '10px', 
                      padding: '0.85rem 1.25rem', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '28px', height: '28px', background: 'var(--primary)', border: '1px solid var(--border-color)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--on-primary)', overflow: 'hidden' }}>
                        {req.userId?.avatar ? <img src={req.userId.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : req.name.charAt(0)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--text-color)', fontSize: '0.85rem', fontWeight: 550 }}>{req.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{req.email}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {new Date(req.updatedAt).toLocaleDateString()}
                      </span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        background: req.status === 'approved' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(239, 68, 68, 0.08)', 
                        color: req.status === 'approved' ? '#16a34a' : '#ef4444', 
                        border: req.status === 'approved' ? '1px solid rgba(22, 163, 74, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)', 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontWeight: 700, 
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em' 
                      }}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className={`${styles.modalBackdrop} ${isClosing ? 'closingBackdrop' : ''}`} onClick={closeModalWithAnim}>
          <div className={`${styles.modalContent} ${isClosing ? 'closingContent' : ''}`} onClick={(e) => e.stopPropagation()}>
            {!generatedLink ? (
              <>
                <h2 className={styles.modalTitle}>Invite New Person</h2>
                <form onSubmit={handleInvite} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label>Full Name</label>
                    <input 
                      required 
                      value={inviteName} 
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="Eg. Jane Cooper"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Email Address</label>
                    <input 
                      required 
                      type="email" 
                      value={inviteEmail} 
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="jane@company.com"
                    />
                  </div>
                  <div className={styles.formGroup}>
                                    <label>System Role</label>
                                    <CustomSelect 
                                      value={inviteRole} 
                                      onChange={(val) => setInviteRole(val as any)}
                                      options={[
                                        { value: 'employee', label: 'Employee' },
                                        { value: 'admin', label: 'Admin' }
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.formGroup}>
                                    <label>Department {inviteRole === 'employee' && <span style={{ color: '#ef4444' }}>*</span>}</label>
                                    <CustomSelect 
                                      value={inviteDeptSelect} 
                                      onChange={setInviteDeptSelect}
                                      placeholder="-- Choose Department --"
                                      options={[
                                        ...mergedDepartments.map(d => ({ value: d, label: d })),
                                        { value: 'OTHER', label: 'Other (Type custom field)' }
                                      ]}
                                    />
                                    {inviteDeptSelect === 'OTHER' && (
                                      <input 
                                        style={{ marginTop: '0.5rem', borderColor: 'var(--primary)' }}
                                        required
                                        value={inviteCustomDept} 
                                        onChange={e => setInviteCustomDept(e.target.value)}
                                        placeholder="Type custom department name..."
                                        maxLength={50}
                                      />
                                    )}
                                  </div>
                  <div className={styles.modalActions}>
                    <button type="button" onClick={closeModalWithAnim} className={styles.cancelBtn}>Cancel</button>
                    <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
                      {isSubmitting ? 'Generating...' : 'Generate Invite'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className={styles.successScreen}>
                <div className={styles.checkCircle}>✓</div>
                <h2>Link Created Successfully!</h2>
                <p>Share the manual onboarding link below with {inviteName}:</p>
                
                <div className={styles.linkBox}>
                  <input readOnly value={generatedLink} />
                  <button onClick={copyToClipboard} className={styles.copyBtn}>
                    {isCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                
                <button onClick={closeModalWithAnim} className={styles.doneBtn}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISPLAY PICTURE (DP) LIGHTBOX ZOOM MODAL */}
      {isZoomOpen && (
        <div className={styles.avatarModalBackdrop} onClick={handleCloseZoom}>
          <div className={styles.avatarModalContent} onClick={(e) => e.stopPropagation()}>
            <button 
              type="button"
              className={styles.avatarCloseBtn} 
              onClick={handleCloseZoom}
              aria-label="Close display picture zoom"
            >
              ×
            </button>
            <div className={styles.largeAvatarCircle}>
              {zoomAvatarUrl ? (
                <img 
                  src={zoomAvatarUrl} 
                  alt={zoomAvatarName} 
                  className={styles.largeAvatarImg} 
                />
              ) : (
                zoomAvatarInitial
              )}
            </div>
            <div className={styles.largeAvatarName}>{zoomAvatarName}</div>
          </div>
        </div>
      )}
    </div>
  );
}
