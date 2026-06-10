"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './profile.module.css';
import { useDialog } from '../../../components/ui/DialogProvider';

import { ALL_COUNTRIES, flagToISO } from '../../../lib/countries';
import { PREDEFINED_DEPARTMENTS } from '../../../lib/departments';
import CustomSelect from '../../../components/ui/CustomSelect';


export default function ProfilePage() {
  const { alert } = useDialog();
  const [user, setUser] = React.useState<any>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Profile fields state
  const [name, setName] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [department, setDepartment] = React.useState('');
  const [deptSelect, setDeptSelect] = React.useState('');
  const [deptCustom, setDeptCustom] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [phone, setPhone] = React.useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = React.useState(false);

  
  // Password fields state
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);

  // Status states
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [isUpdatingPass, setIsUpdatingPass] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState({ text: '', isError: false });
  const [passwordMsg, setPasswordMsg] = React.useState({ text: '', isError: false });
  const [isUploading, setIsUploading] = React.useState(false);

  // Organization Expand Modal
  const [showModal, setShowModal] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [orgError, setOrgError] = React.useState('');

  React.useEffect(() => {
    api.get('/auth/me').then(res => {
      const u = res.data.user;
      setUser(u);
      setOrg(res.data.org);
      
      setName(u.name || '');
      setUsername(u.username || '');
      setDepartment(u.department || '');
      
      // Parse department selectors
      const curDept = u.department || '';
      const orgDepts = res.data.org?.departments || [];
      const availableDepts = [...PREDEFINED_DEPARTMENTS, ...orgDepts];
      const isPreset = availableDepts.some(d => d.toLowerCase() === curDept.toLowerCase());
      if (isPreset) {
        const matchedStr = availableDepts.find(d => d.toLowerCase() === curDept.toLowerCase());
        setDeptSelect(matchedStr || curDept);
        setDeptCustom('');
      } else {
        setDeptSelect(curDept ? 'OTHER' : '');
        setDeptCustom(curDept);
      }

      setCountryCode(u.countryCode || '+91');
      setPhone(u.phone || '');

      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target?.result as string;
        const img = new Image();
        img.src = base64Data;
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            const size = 256;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas build fail');
            const minSide = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - minSide)/2, (img.height - minSide)/2, minSide, minSide, 0, 0, size, size);
            const optimizedStr = canvas.toDataURL('image/jpeg', 0.8);
            
            await api.patch('/users/avatar', { avatar: optimizedStr });
            setUser((p: any) => ({ ...p, avatar: optimizedStr }));
          } catch (err: any) {
            await alert(err.response?.data?.message || 'Failed saving image', 'Error');
          } finally {
            setIsUploading(false);
          }
        };
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMsg({ text: '', isError: false });

    let finalDept = deptSelect;
    if (deptSelect === 'OTHER') {
      finalDept = deptCustom.trim();
    }

    try {
      const res = await api.patch('/users/profile', {
        name,
        username,
        department: finalDept,
        countryCode,
        phone
      });
      setUser(res.data.user);
      setDepartment(res.data.user.department || '');
      setProfileMsg({ text: 'Profile updated successfully!', isError: false });
    } catch (err: any) {
      setProfileMsg({
        text: err.response?.data?.message || 'Failed to update profile.',
        isError: true
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg({ text: '', isError: false });

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match.', isError: true });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMsg({ text: 'Password must be at least 6 characters.', isError: true });
      return;
    }

    setIsUpdatingPass(true);
    try {
      await api.patch('/users/password', {
        currentPassword,
        newPassword
      });
      setPasswordMsg({ text: 'Password altered securely!', isError: false });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({
        text: err.response?.data?.message || 'Incorrect current password.',
        isError: true
      });
    } finally {
      setIsUpdatingPass(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setOrgError('');
    try {
      const res = await api.post('/auth/expand-org', {
        orgName: newOrgName,
        slug: newSlug
      });
      const { accessToken } = res.data;
      const apiModule = await import('../../../lib/api');
      apiModule.setAccessToken(accessToken);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setOrgError(err.response?.data?.message || 'Failed launching network node.');
      setIsCreating(false);
    }
  };

  if (isLoading) return <div className={styles.loaderContainer}><div className={styles.loader}></div></div>;
  if (!user) return <div className={styles.error}>Failed acquiring profile data.</div>;

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  const customOrgsDepts = org?.departments || [];
  const mergedDepartments = Array.from(new Set([...PREDEFINED_DEPARTMENTS, ...customOrgsDepts]));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account Identity</h1>
        <p className={styles.sub}>Manage your organizational records and secure credentials.</p>
      </header>

      <div className={styles.layoutGrid}>
        
        {/* Card 1: Core Profile Identity */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrapper}>👤</div>
            <div>
              <h2 className={styles.cardTitle}>Personal Identity</h2>
              <p className={styles.cardSub}>Your public details inside {org?.name}.</p>
            </div>
          </div>

          <div className={styles.heroSection}>
            <div className={styles.avatarWrapper}>
              <div className={styles.avatarLarge}>
                {isUploading ? '...' : user.avatar ? <img src={user.avatar} className={styles.fullImg} alt="User Avatar" /> : user.name.charAt(0)}
              </div>
              <label className={styles.uploadOverlay} title="Upload photo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                <input type="file" accept="image/*" hidden onChange={handleFileChange} disabled={isUploading} />
              </label>
            </div>
            <div className={styles.heroInfo}>
              <h3>{user.name}</h3>
              <span className={isAdmin ? styles.badgeAdmin : styles.badgeEmployee}>
                {isAdmin ? 'Space Administrator' : 'Internal Staff'}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className={styles.form}>
            {profileMsg.text && (
              <div className={profileMsg.isError ? styles.alertError : styles.alertSuccess}>
                {profileMsg.text}
              </div>
            )}

            <div className={styles.field}>
              <label>Full Display Name</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Natu Kaka" />
            </div>

            <div className={styles.field}>
              <label>Unique @Username (for tagging in chat)</label>
              <div className={styles.usernameInputWrapper}>
                <span className={styles.atPrefix}>@</span>
                <input 
                  required 
                  type="text" 
                  value={username} 
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                  placeholder="natukaka" 
                  className={styles.usernameField}
                />
              </div>
              <small className={styles.fieldHint}>Only lowercase letters, numbers, and underscores allowed.</small>
            </div>

            <div className={styles.field}>
              <label>Division / Department</label>
              {isAdmin ? (
                <>
                  <CustomSelect 
                    value={deptSelect} 
                    onChange={setDeptSelect}
                    placeholder="-- Choose Department --"
                    options={[
                      ...mergedDepartments.map(d => ({ value: d, label: d })),
                      { value: 'OTHER', label: 'Other...' }
                    ]}
                  />
                  {deptSelect === 'OTHER' && (
                    <input 
                      style={{ marginTop: '0.75rem', borderColor: '#6366f1' }}
                      required
                      value={deptCustom} 
                      onChange={e => setDeptCustom(e.target.value)}
                      placeholder="Type custom department name..."
                      maxLength={50}
                    />
                  )}
                </>
              ) : (
                <>
                  <input 
                    type="text" 
                    value={department || 'Unassigned'} 
                    disabled
                    style={{ opacity: 0.8 }}
                  />
                  <small className={styles.fieldHint}>Only admins can reassign organizational departments.</small>
                </>
              )}
            </div>

            <div className={styles.field}>
              <label>Assigned Workspace Role</label>
              <div className={styles.readOnlyBox}>
                {user.role.replace('_', ' ')}
              </div>
            </div>

            <button type="submit" disabled={isSavingProfile} className={styles.saveBtn}>
              {isSavingProfile ? 'Committing Changes...' : 'Save Identity Data'}
            </button>
          </form>
        </div>

        {/* Card 2: Contact Methods */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrapper}>📞</div>
            <div>
              <h2 className={styles.cardTitle}>Communication</h2>
              <p className={styles.cardSub}>Your secured channels of contact.</p>
            </div>
          </div>

          <div className={styles.form}>
            <div className={styles.field}>
              <label>Primary Email (System Secured)</label>
              <div className={styles.readOnlyBox}>
                {user.email || 'Unassigned'}
              </div>
              <small className={styles.fieldHint}>Emails are bound to identity nodes and cannot be altered without admin authorization.</small>
            </div>

            <div className={styles.field}>
              <label>Registered Workspace Phone</label>
              <div className={styles.phoneSplit}>
                <div className={styles.customCountrySelectWrapper}>
                  <button 
                    type="button"
                    className={styles.customCountryBtn}
                    onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                  >
                    <span className={styles.selectedText}>
                      {(() => {
                        const found = ALL_COUNTRIES.find(c => c.code === countryCode);
                        return found ? `${flagToISO(found.flag)} ${found.code}` : 'IN +91';
                      })()}
                    </span>
                    <svg 
                      className={styles.chevron} 
                      style={{ transform: countryDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {countryDropdownOpen && (
                    <>
                      <div className={styles.dropdownOverlay} onClick={() => setCountryDropdownOpen(false)} />
                      <div className={styles.countryDropdownMenu}>
                        {ALL_COUNTRIES.map(c => (
                          <div 
                            key={c.name}
                            className={styles.countryDropdownItem}
                            onClick={() => {
                              setCountryCode(c.code);
                              setCountryDropdownOpen(false);
                            }}
                          >
                            <span className={styles.itemLabel}>
                              <strong>{flagToISO(c.flag)}</strong> {c.code} <span className={styles.itemName}>({c.name})</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <input 
                  type="tel" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
                  placeholder="e.g. 98765 43210"
                  className={styles.phoneInput}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Workspace Slug Context</label>
              <div className={styles.readOnlyBox}>
                @{org?.slug || 'core'}
              </div>
            </div>

            <button onClick={handleSaveProfile} disabled={isSavingProfile} className={styles.saveBtn}>
              {isSavingProfile ? 'Syncing Contacts...' : 'Update Contact Matrix'}
            </button>
          </div>
        </div>

        {/* Card 3: Security & Access */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrapper}>🔐</div>
            <div>
              <h2 className={styles.cardTitle}>Security Ledger</h2>
              <p className={styles.cardSub}>Alter cryptographic authentication keys.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className={styles.form}>
            {passwordMsg.text && (
              <div className={passwordMsg.isError ? styles.alertError : styles.alertSuccess}>
                {passwordMsg.text}
              </div>
            )}

            <div className={styles.field}>
              <label>Current Authenticator Key</label>
              <div className={styles.passwordInputContainer}>
                <input 
                  required 
                  type={showCurrent ? "text" : "password"} 
                  value={currentPassword} 
                  onChange={e => setCurrentPassword(e.target.value)} 
                  placeholder="••••••••" 
                />
                <button 
                  type="button" 
                  className={styles.eyeBtn} 
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                  aria-label="Reveal current authenticator key"
                >
                  {showCurrent ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label>New Authenticator Key</label>
              <div className={styles.passwordInputContainer}>
                <input 
                  required 
                  type={showNew ? "text" : "password"} 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="Min 6 characters" 
                />
                <button 
                  type="button" 
                  className={styles.eyeBtn} 
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                  aria-label="Reveal new key"
                >
                  {showNew ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label>Confirm New Cryptographic Key</label>
              <input 
                required 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Confirm characters" 
              />
            </div>

            <button type="submit" disabled={isUpdatingPass} className={styles.dangerBtn}>
              {isUpdatingPass ? 'Recalculating Cryptography...' : 'Rewrite Security Credentials'}
            </button>
          </form>
        </div>

        {/* Card 4: Expand Org (Admin Only) */}
        {isAdmin && (
          <div className={`${styles.card} ${styles.orgExpandCard}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrapper}>🚀</div>
              <div>
                <h2 className={styles.cardTitle}>Venture Catalyst</h2>
                <p className={styles.cardSub}>Launch an entirely parallel workspace environment.</p>
              </div>
            </div>
            
            <p className={styles.expansionDesc}>
              Need an autonomous department matrix or subsidiary silo? Seamlessly deploy a distinct secondary workspace instantly.
            </p>

            <button onClick={() => setShowModal(true)} className={styles.catalystBtn}>
              + Add Custom Organization
            </button>
          </div>
        )}

      </div>

      {/* Expand Organization Modal */}
      {showModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2>Deploy New Network Grid</h2>
            <p className={styles.modalDesc}>Assign nodes and namespace anchors.</p>
            
            {orgError && <div className={styles.alertError}>{orgError}</div>}

            <form onSubmit={handleCreateOrganization} className={styles.form}>
              <div className={styles.field}>
                <label>New Corporate Architecture Name</label>
                <input required placeholder="e.g. Stark Industries" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Assigned Root Namespace (Slug)</label>
                <input required placeholder="stark-core" value={newSlug} onChange={e => setNewSlug(e.target.value)} />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Abort Mission</button>
                <button type="submit" disabled={isCreating} className={styles.confirmBtn}>
                  {isCreating ? 'Executing Deployment...' : 'Launch Autonomous Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
