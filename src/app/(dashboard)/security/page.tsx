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
  const [deviceToRevoke, setDeviceToRevoke] = useState<any>(null);

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
    setShowConfirmModal(false);
    try {
      const res = await api.delete(`/auth/2fa/devices/${deviceToRevoke.id}`);
      
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
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to revoke device.');
    } finally {
      setSubmitting(false);
      setDeviceToRevoke(null);
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
            <div className={styles.cardIconWrapper}>🛡️</div>
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
                      🗑️
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
                            📋
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
                  className={styles.toggleBtn}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
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
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
                    >
                      {copiedIndex === idx ? '✓' : '📋'}
                    </button>
                  </div>
                ))}
              </div>

              <div className={styles.backupActions}>
                <button onClick={downloadBackupCodesFile} className={styles.backupBtn}>
                  📥 <span className={styles.btnText}>Download as File</span>
                </button>
                <button onClick={() => copyToClipboard(backupCodes.join('\n'))} className={styles.backupBtn}>
                  📋 <span className={styles.btnText}>Copy All</span>
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
            <div className={styles.cardIconWrapper}>💡</div>
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
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Revoke Authenticator Device</h3>
            <p className={styles.modalBody}>
              {user?.twoFactorDevices?.length === 1 ? (
                <strong>
                  ⚠️ WARNING: This is your last registered device. Revoking it will automatically disable Two-Factor Authentication (2FA) for your account, and delete your backup recovery codes.
                </strong>
              ) : (
                `Are you sure you want to revoke the device "${deviceToRevoke.deviceName}"? You will no longer be able to log in using codes from this device.`
              )}
            </p>
            <div className={styles.modalActions}>
              <button 
                type="button" 
                onClick={() => { setShowConfirmModal(false); setDeviceToRevoke(null); }} 
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
