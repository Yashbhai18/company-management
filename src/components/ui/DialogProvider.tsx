"use client";
import React from 'react';
import api from '../../lib/api';
import styles from './dialog.module.css';

type DialogMode = 'alert' | 'confirm' | 'confirm2fa';

interface DialogConfig {
  isOpen: boolean;
  mode: DialogMode;
  title: string;
  message: string;
  resolve: (value: boolean) => void;
}

interface DialogContextProps {
  alert: (message: string, title?: string) => Promise<boolean>;
  confirm: (message: string, title?: string) => Promise<boolean>;
  confirm2fa: (message: string, title?: string) => Promise<boolean>;
}

const DialogContext = React.createContext<DialogContextProps | undefined>(undefined);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<DialogConfig>({
    isOpen: false,
    mode: 'alert',
    title: '',
    message: '',
    resolve: () => {},
  });

  // 2FA state
  const [otpCode, setOtpCode] = React.useState('');
  const [otpError, setOtpError] = React.useState('');
  const [otpLoading, setOtpLoading] = React.useState(false);

  const openDialog = (mode: DialogMode, message: string, title: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setOtpCode('');
      setOtpError('');
      setOtpLoading(false);
      setConfig({ isOpen: true, mode, title, message, resolve });
    });
  };

  const alert = (message: string, title = 'Notification') => openDialog('alert', message, title);
  const confirm = (message: string, title = 'Confirm Action') => openDialog('confirm', message, title);
  const confirm2fa = (message: string, title = 'Verify Identity') => openDialog('confirm2fa', message, title);

  const handleClose = (val: boolean) => {
    config.resolve(val);
    setConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const handle2faSubmit = async () => {
    if (otpCode.length < 6) {
      setOtpError('Please enter your 6-digit authenticator code.');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      await api.post('/auth/2fa/verify-action', { code: otpCode });
      handleClose(true);
    } catch (err: any) {
      setOtpError(err.response?.data?.message || 'Invalid code. Please try again.');
      setOtpLoading(false);
    }
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    if (!config.isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(false); }
      if (e.key === 'Enter' && config.mode !== 'confirm2fa') { e.preventDefault(); handleClose(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config.isOpen, config.mode, config.resolve]);

  const is2fa = config.mode === 'confirm2fa';
  const isConfirm = config.mode === 'confirm' || is2fa;

  return (
    <DialogContext.Provider value={{ alert, confirm, confirm2fa }}>
      {children}
      {config.isOpen && (
        <div className={styles.overlay} onClick={() => !isConfirm && handleClose(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                {is2fa ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2"/>
                    <path d="M11 16a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/>
                    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                  </svg>
                ) : config.mode === 'confirm' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                )}
              </div>
              <h3 className={styles.title}>{config.title}</h3>
            </div>

            {/* Message */}
            <p className={styles.message}>{config.message}</p>

            {/* 2FA OTP Input */}
            {is2fa && (
              <div className={styles.twoFaSection}>
                <label className={styles.twoFaLabel}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Authenticator Code
                </label>
                <p className={styles.twoFaHint}>Enter the 6-digit code from your authenticator app to authorize this action.</p>
                <div className={styles.twoFaInputRow}>
                  <input
                    id="dialog-otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setOtpError('');
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handle2faSubmit(); }}
                    className={styles.otpInput}
                    placeholder="000000"
                    autoFocus
                    autoComplete="one-time-code"
                    disabled={otpLoading}
                  />
                </div>
                {otpError && (
                  <span className={styles.twoFaError}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {otpError}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className={styles.footer}>
              {isConfirm && (
                <button className={`${styles.btn} ${styles.cancelBtn}`} onClick={() => handleClose(false)} disabled={otpLoading}>
                  Cancel
                </button>
              )}
              <button
                className={`${styles.btn} ${styles.confirmBtn}`}
                onClick={is2fa ? handle2faSubmit : () => handleClose(true)}
                disabled={otpLoading || (is2fa && otpCode.length < 6)}
              >
                {otpLoading && <span className={styles.spinner} />}
                {is2fa ? (otpLoading ? 'Verifying...' : 'Authorize') : (isConfirm ? 'Confirm' : 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export const useDialog = () => {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider');
  return ctx;
};
