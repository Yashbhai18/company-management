"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './register.module.css';

export default function RegisterPage() {
  const [orgName, setOrgName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  const [showPassword, setShowPassword] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.post('/auth/register', { orgName, slug, name, email, password });
      const { accessToken } = res.data;
      // store in memory via import to avoid circular; set on window for initial navigation
      (await import('../../../lib/api')).setAccessToken(accessToken);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Registration failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.glassContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Create Organization</h1>
        <p className={styles.subtitle}>Get your team set up in minutes.</p>
      </div>

      {errorMsg && <div className={styles.errorMessage}>{errorMsg}</div>}

      <form onSubmit={submit} className={styles.form}>
        <div className={styles.rowGroup}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Organization Name</label>
            <input 
              className={styles.input} 
              placeholder="Acme Corp" 
              value={orgName} 
              onChange={(e) => setOrgName(e.target.value)} 
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Slug</label>
            <input 
              className={styles.input} 
              placeholder="acme" 
              value={slug} 
              onChange={(e) => setSlug(e.target.value)} 
              required
            />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Your Name</label>
          <input 
            className={styles.input} 
            placeholder="Jane Doe" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Email</label>
          <input 
            type="email"
            className={styles.input} 
            placeholder="jane@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label}>Password</label>
          <div className={styles.passwordWrapper}>
            <input 
              type={showPassword ? 'text' : 'password'} 
              className={`${styles.input} ${styles.passwordInput}`} 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
              minLength={8}
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
          {isLoading ? <span className={styles.loader}></span> : 'Create account'}
        </button>
      </form>

      <p className={styles.footerText}>
        Already have an account? <a href="/login" className={styles.link}>Sign in</a>
      </p>
    </div>
  );
}
