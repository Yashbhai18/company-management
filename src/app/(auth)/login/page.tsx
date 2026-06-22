"use client";
import React from 'react';
import useAuth from '../../../hooks/useAuth';
import api from '../../../lib/api';
import styles from './login.module.css';

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  
  const [mode, setMode] = React.useState<'password' | 'magic'>('password');
  const [isSendingLink, setIsSendingLink] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = await login(identifier, password);
      if (result && result.requires2fa) {
        sessionStorage.setItem('temp2faToken', result.tempToken);
        window.location.href = '/login/verify-2fa';
      } else if (result && result.requiresPasswordReset) {
        sessionStorage.setItem('resetPasswordEmail', result.email);
        sessionStorage.setItem('resetPasswordMessage', result.message);
        window.location.href = '/forgot-password?forced=true';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSendingLink(true);
    try {
      await api.post('/auth/magic-link', { email: identifier });
      setSuccessMsg('Magic link sent! Please check your email inbox.');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to send magic link. Make sure the email is registered.');
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <div className={styles.glassContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>
          {mode === 'password' 
            ? 'Enter your details to access your account.' 
            : 'Enter your email to receive a passwordless sign-in link.'}
        </p>
      </div>
      
      {errorMsg && <div className={styles.errorMessage}>{errorMsg}</div>}
      {successMsg && <div style={{
        background: 'rgba(39, 103, 62, 0.1)',
        border: '1px solid rgba(39, 103, 62, 0.2)',
        color: 'var(--success)',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        fontSize: '0.875rem',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>{successMsg}</div>}

      {mode === 'password' ? (
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email, Username, or Phone</label>
            <input 
              className={styles.input} 
              placeholder="Enter email, username, or phone" 
              value={identifier} 
              onChange={(e) => setIdentifier(e.target.value)} 
              required
            />
          </div>
          
          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Password</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button 
                  type="button" 
                  onClick={() => { setMode('magic'); setErrorMsg(''); setSuccessMsg(''); }} 
                  className={styles.forgotLink}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Magic Link
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.5 }}>|</span>
                <a href="/forgot-password" className={styles.forgotLink}>
                  Forgot Password?
                </a>
              </div>
            </div>
            <div className={styles.passwordWrapper}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                className={`${styles.input} ${styles.passwordInput}`} 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required
              />
              <button 
                type="button" 
                className={styles.toggleEyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className={styles.eyeIcon} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className={styles.eyeIcon} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          
          <button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? <span className={styles.loader}></span> : 'Sign in'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSendMagicLink} className={styles.form}>
          <div className={styles.inputGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Email Address</label>
              <button 
                type="button" 
                onClick={() => { setMode('password'); setErrorMsg(''); setSuccessMsg(''); }} 
                className={styles.forgotLink}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Sign in with Password
              </button>
            </div>
            <input 
              type="email"
              className={styles.input} 
              placeholder="Enter your registered email" 
              value={identifier} 
              onChange={(e) => setIdentifier(e.target.value)} 
              required
            />
          </div>
          
          <button type="submit" className={styles.submitBtn} disabled={isSendingLink}>
            {isSendingLink ? <span className={styles.loader}></span> : 'Send Magic Link'}
          </button>
        </form>
      )}

      <p className={styles.footerText}>
        Don't have an account? <a href="/register" className={styles.link}>Sign up</a>
      </p>
    </div>
  );
}
