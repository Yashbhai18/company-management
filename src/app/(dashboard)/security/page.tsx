"use client";
import React, { useEffect, useState } from 'react';
import api from '../../../lib/api';
import styles from './security.module.css';

export default function SecurityPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Setup Wizard State
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState('');

  // Backup Codes State
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Disable State
  const [isDisabling, setIsDisabling] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // General Notification States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Multi-Device States
  const [setupDeviceName, setSetupDeviceName] = useState('');
  const [setupStep, setSetupStep] = useState(1); // 1 = Device Name input, 2 = Scan QR & Code Entry
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isClosingConfirm, setIsClosingConfirm] = useState(false);
  const [deviceToRevoke, setDeviceToRevoke] = useState<any>(null);

  const closeConfirmModal = () => {
    setIsClosingConfirm(true);
    setTimeout(() => {
      setShowConfirmModal(false);
      setDeviceToRevoke(null);
      setIsClosingConfirm(false);
    }, 250);
  };

  useEffect(() => {
    loadUserStatus();
  }, []);

  const loadUserStatus = async () => {
    try {
      const res = await api.get('/auth/me');
      const u = res.data.user;
      setUser(u);
      setTwoFactorEnabled(u.twoFactorEnabled);
      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const startSetup = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSetupDeviceName('');
    setSetupStep(1);
    setIsSettingUp(true);
  };

  const handleDeviceNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = setupDeviceName.trim();
    if (!cleanName) {
      setErrorMsg('Device name is required.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await api.post('/auth/2fa/setup', { deviceName: cleanName });
      setQrCodeUrl(res.data.qrCodeUrl);
      setManualKey(res.data.manualKey);
      setSetupStep(2);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to initiate 2FA setup.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await api.post('/auth/2fa/enable', { code: setupCode });
      if (res.data.backupCodes && res.data.backupCodes.length > 0) {
        setBackupCodes(res.data.backupCodes);
      } else {
        setBackupCodes(null);
        setSuccessMsg(`Device "${setupDeviceName}" was registered successfully!`);
      }
      setTwoFactorEnabled(true);
      setIsSettingUp(false);
      setSetupStep(1);
      setSetupDeviceName('');
      setQrCodeUrl(null);
      setManualKey(null);
      setSetupCode('');
      
      // Refresh user status in background
      const userRes = await api.get('/auth/me');
      setUser(userRes.data.user);
      setTwoFactorEnabled(userRes.data.user.twoFactorEnabled);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Verification failed. Please check the code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeClick = (device: any) => {
    setDeviceToRevoke(device);
    setShowConfirmModal(true);
  };

  const handleRevokeConfirm = async () => {
    if (!deviceToRevoke) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await api.delete(`/auth/2fa/devices/${deviceToRevoke.id}`);
      
      setIsClosingConfirm(true);
      setTimeout(async () => {
        setShowConfirmModal(false);
        setDeviceToRevoke(null);
        setIsClosingConfirm(false);
        
        if (res.data.twoFactorEnabled === false) {
          setTwoFactorEnabled(false);
          setBackupCodes(null);
          setSuccessMsg(`Device "${deviceToRevoke.deviceName}" has been revoked. Two-Factor Authentication is now disabled.`);
        } else {
          setSuccessMsg(`Device "${deviceToRevoke.deviceName}" has been successfully revoked.`);
        }
        
        // Refresh user status
        const userRes = await api.get('/auth/me');
        setUser(userRes.data.user);
        setTwoFactorEnabled(userRes.data.user.twoFactorEnabled);
      }, 250);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to revoke device.');
      setDeviceToRevoke(null);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordConfirm) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await api.post('/auth/2fa/disable', { passwordConfirm });
      setTwoFactorEnabled(false);
      setIsDisabling(false);
      setPasswordConfirm('');
      setBackupCodes(null);
      setSuccessMsg('Two-Factor Authentication has been disabled.');
      
      // Refresh user status in background
      api.get('/auth/me').then(res => setUser(res.data.user));
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to disable 2FA. Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  };

  const regenerateBackupCodes = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await api.post('/auth/2fa/regenerate-backup-codes');
      setBackupCodes(res.data.backupCodes);
      setSuccessMsg('New backup recovery codes have been regenerated successfully.');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to regenerate backup codes.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const downloadBackupCodesFile = () => {
    if (!backupCodes) return;
    const content = `AttendanceTracker 2FA Backup Recovery Codes\nGenerated: ${new Date().toLocaleString()}\n\nKeep these codes secure. Each code can only be used once.\n\n` + backupCodes.map((c, i) => `Code ${i + 1}: ${c}`).join('\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `2fa-backup-codes-${user?.email || 'admin'}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cancelSetup = () => {
    setIsSettingUp(false);
    setSetupStep(1);
    setSetupDeviceName('');
    setQrCodeUrl(null);
    setManualKey(null);
    setSetupCode('');
    setErrorMsg(null);
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loaderContainer}>
          <div className={styles.loader}></div>
        </div>
      </div>
    );
  }

  // Double check admin privileges (fail-safe)
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.alertError}>
          Access Denied: Only workspace administrators can access Security settings.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Security Settings</h1>
        <p className={styles.sub}>Configure and enforce two-factor protection keys for administrator accounts.</p>
      </header>

      <div className={styles.layoutGrid}>
        {/* Card 1: Two-Factor Settings Dashboard */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrapper}>
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '20px', height: '20px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            </div>
            <div>
              <h2 className={styles.cardTitle}>Authenticator 2FA</h2>
              <p className={styles.cardSub}>Protect your admin panel access with a temporary code.</p>
            </div>
          </div>

          {successMsg && <div className={styles.alertSuccess}>{successMsg}</div>}
          {errorMsg && <div className={styles.alertError}>{errorMsg}</div>}

          {/* 2FA Status Banner */}
          {!isSettingUp && !isDisabling && !backupCodes && (
            <div className={styles.statusBanner}>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Security Shield Status</span>
                <span className={`${styles.statusValue} ${twoFactorEnabled ? styles.statusActive : styles.statusInactive}`}>
                  {twoFactorEnabled ? '● Fully Active (Shield ON)' : '○ Inactive (Shield OFF)'}
                </span>
              </div>
              {twoFactorEnabled ? (
                <button onClick={() => setIsDisabling(true)} className={styles.toggleBtnDisable}>
                  Disable 2FA
                </button>
              ) : (
                <button onClick={startSetup} disabled={submitting} className={styles.toggleBtn}>
                  {submitting ? 'Initiating...' : 'Enable 2FA'}
                </button>
              )}
            </div>
          )}

          {/* Registered Devices Section (shown when 2FA is active) */}
          {twoFactorEnabled && !isSettingUp && !isDisabling && !backupCodes && (
            <div className={styles.devicesSection}>
              <h3 className={styles.devicesTitle}>Registered Devices</h3>
              <div className={styles.devicesList}>
                {user?.twoFactorDevices && user.twoFactorDevices.map((device: any) => (
                  <div key={device.id} className={styles.deviceRow}>
                    <div className={styles.deviceInfo}>
                      <span className={styles.deviceName}>{device.deviceName}</span>
                      <span className={styles.deviceDate}>
                        Added: {new Date(device.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleRevokeClick(device)} 
                      className={styles.deviceRevokeBtn}
                      title="Revoke Device"
                      disabled={submitting}
                    >
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '16px', height: '16px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                ))}
                {(!user?.twoFactorDevices || user.twoFactorDevices.length === 0) && (
                  <p className={styles.stepDescription} style={{ margin: 0 }}>No devices registered.</p>
                )}
              </div>
              <button onClick={startSetup} className={styles.addDeviceBtn} disabled={submitting}>
                ＋ Add Authenticator Device
              </button>
            </div>
          )}

          {/* 2FA Setup Flow Wizard */}
          {isSettingUp && (
            <div className={styles.setupContainer}>
              {/* Step 1: Device Name Input */}
              {setupStep === 1 && (
                <form onSubmit={handleDeviceNameSubmit} className={styles.form}>
                  <h3 className={styles.stepTitle}>Step 1: Name Your Device</h3>
                  <p className={styles.stepDescription}>
                    Assign a recognizable name to this authenticator device (e.g. "Work iPhone" or "Personal iPad") to track your registered keys.
                  </p>
                  <div className={styles.field}>
                    <label>Device Name</label>
                    <input
                      type="text"
                      placeholder="e.g. My Primary iPhone"
                      value={setupDeviceName}
                      onChange={(e) => setSetupDeviceName(e.target.value)}
                      required
                      disabled={submitting}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <button 
                      type="button" 
                      onClick={cancelSetup} 
                      className={styles.toggleBtnDisable}
                      style={{ flex: 1 }}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className={styles.submitBtn} 
                      style={{ flex: 1 }}
                      disabled={submitting || !setupDeviceName.trim()}
                    >
                      {submitting ? 'Generating...' : 'Continue'}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Scan QR & Confirm OTP */}
              {setupStep === 2 && qrCodeUrl && manualKey && (
                <div>
                  <div>
                    <h3 className={styles.stepTitle}>Step 2: Scan QR Code</h3>
                    <p className={styles.stepDescription}>
                      Scan the QR code below using your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.).
                    </p>
                    <div className={styles.qrWrapper}>
                      <img src={qrCodeUrl} className={styles.qrImage} alt="TOTP QR Code" />
                      <div className={styles.qrDetails}>
                        <span className={styles.manualKeyLabel}>Can't scan? Enter this key manually:</span>
                        <div className={styles.manualKeyBox}>
                          <span className={styles.manualKey}>{manualKey}</span>
                          <button 
                            type="button" 
                            onClick={() => copyToClipboard(manualKey)} 
                            className={styles.copyBtn}
                            title="Copy key"
                          >
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={confirmEnable} className={styles.form} style={{ marginTop: '1.5rem' }}>
                    <h3 className={styles.stepTitle}>Step 3: Confirm Activation</h3>
                    <p className={styles.stepDescription}>
                      Enter the 6-digit verification code generated by your app for device "{setupDeviceName}" to verify syncing.
                    </p>
                    <div className={styles.field}>
                      <label>Authenticator Code (6 Digits)</label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="e.g. 123456"
                        value={setupCode}
                        onChange={(e) => setSetupCode(e.target.value.replace(/[^0-9]/g, ''))}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                      <button 
                        type="button" 
                        onClick={cancelSetup} 
                        className={styles.toggleBtnDisable}
                        style={{ flex: 1 }}
                        disabled={submitting}
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className={styles.submitBtn} 
                        style={{ flex: 1 }}
                        disabled={submitting || setupCode.length !== 6}
                      >
                        {submitting ? 'Verifying...' : 'Activate Device'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* 2FA Disable Password Request */}
          {isDisabling && (
            <form onSubmit={confirmDisable} className={styles.form}>
              <h3 className={styles.stepTitle}>Confirm Deactivation</h3>
              <p className={styles.stepDescription}>
                For security reasons, please confirm your administrator password to disable Authenticator-based 2FA. This will revoke all registered devices.
              </p>
              <div className={styles.field}>
                <label>Admin Password</label>
                <input
                  type="password"
                  placeholder="Enter password to confirm"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  onClick={() => { setIsDisabling(false); setPasswordConfirm(''); setErrorMsg(null); }} 
                  className={styles.modalCancelBtn}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={styles.dangerBtn} 
                  style={{ flex: 1, margin: 0 }}
                  disabled={submitting}
                >
                  {submitting ? 'Confirming...' : 'Disable Protection'}
                </button>
              </div>
            </form>
          )}

          {/* Backup Codes Display on Success Setup */}
          {backupCodes && (
            <div className={styles.successContainer}>
              <h3 className={styles.stepTitle}>One-time Backup Recovery Codes</h3>
              <p className={styles.stepDescription}>
                If you lose access to your authenticator app, you can use these one-time codes to sign in. Save them now — they will not be shown again!
              </p>
              
              <div className={styles.backupGrid}>
                {backupCodes.map((code, idx) => (
                  <div 
                    key={idx} 
                    className={styles.backupCodeBox}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{code}</span>
                    <button 
                      onClick={() => copyToClipboard(code, idx)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7, display: 'flex', alignItems: 'center' }}
                    >
                      {copiedIndex === idx ? '✓' : <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '12px', height: '12px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" /></svg>}
                    </button>
                  </div>
                ))}
              </div>

              <div className={styles.backupActions}>
                <button onClick={downloadBackupCodesFile} className={styles.backupBtn}>
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  <span className={styles.btnText}>Download as File</span>
                </button>
                <button onClick={() => copyToClipboard(backupCodes.join('\n'))} className={styles.backupBtn}>
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '14px', height: '14px', marginRight: '6px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" /></svg>
                  <span className={styles.btnText}>Copy All</span>
                </button>
              </div>

              <button 
                onClick={() => { setBackupCodes(null); setSuccessMsg('Two-Factor Authentication is fully setup.'); }} 
                className={styles.submitBtn}
                style={{ marginTop: '0.5rem' }}
              >
                Finished saving codes
              </button>
            </div>
          )}

          {/* Backup Codes Manager (when 2FA already enabled) */}
          {twoFactorEnabled && !isDisabling && !backupCodes && (
            <div className={styles.backupCodesManager}>
              <div className={styles.managerHeader}>
                <span className={styles.managerTitle}>Backup Recovery Codes Ledger</span>
                <button 
                  onClick={regenerateBackupCodes} 
                  disabled={submitting} 
                  className={styles.regenerateBtn}
                >
                  {submitting ? 'Regenerating...' : 'Regenerate Codes'}
                </button>
              </div>
              <p className={styles.stepDescription} style={{ margin: 0, fontSize: '0.8rem' }}>
                Regenerating new recovery codes will instantly invalidate your previous set of backup codes.
              </p>
            </div>
          )}
        </div>

        {/* Card 2: Security Best Practices Info */}
        <div className={`${styles.card} ${styles.infoCard}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWrapper}>
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" style={{ width: '20px', height: '20px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m-7.071.071l1.414 1.414m-3.414 6.515H5m.071 7.071l1.414-1.414M12 20v2m5.657-2.929l1.414 1.414m1.515-5.657H20m-2.929-5.657l1.414-1.414" /></svg>
            </div>
            <div>
              <h2 className={styles.cardTitle}>Security Guidelines</h2>
              <p className={styles.cardSub}>Why administrative 2FA protection is vital.</p>
            </div>
          </div>

          <ul className={styles.bulletList}>
            <li>
              <strong>Elevated Clearance:</strong> Administrators control team rosters, invoice logs, base salary matrices, and workplace configurations. Compounding passwords with TOTP codes cuts credential theft risk by over 99%.
            </li>
            <li>
              <strong>Time-Window Syncing:</strong> Standard TOTP tokens update every 30 seconds. Ensure your device's system time is set automatically to prevent code drift issues.
            </li>
            <li>
              <strong>Safe Recovery Storage:</strong> Keep your one-time backup recovery codes stored in a secure password manager or offline vault. Do not store them in screenshot image files or unprotected notes.
            </li>
            <li>
              <strong>Separate Siloing:</strong> This secondary security layer is applied exclusively to managers and workspace owners. Employees continue signing in using standard email & password parameters.
            </li>
          </ul>
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      {showConfirmModal && deviceToRevoke && (
        <div className={`${styles.modalOverlay} ${isClosingConfirm ? 'closingOverlay' : ''}`} onClick={closeConfirmModal}>
          <div className={`${styles.modalContent} ${isClosingConfirm ? 'closingContent' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Revoke Authenticator Device</h3>
            <p className={styles.modalBody}>
              {user?.twoFactorDevices?.length === 1 ? (
                <strong>
                  WARNING: This is your last registered device. Revoking it will automatically disable Two-Factor Authentication (2FA) for your account, and delete your backup recovery codes.
                </strong>
              ) : (
                `Are you sure you want to revoke the device "${deviceToRevoke.deviceName}"? You will no longer be able to log in using codes from this device.`
              )}
            </p>
            <div className={styles.modalActions}>
              <button 
                type="button" 
                onClick={closeConfirmModal} 
                className={styles.modalCancelBtn}
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleRevokeConfirm} 
                className={styles.modalConfirmBtn}
                disabled={submitting}
              >
                {submitting ? 'Revoking...' : 'Yes, Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
