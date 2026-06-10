"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import api from '../../../../lib/api';
import styles from './invite.module.css';
import { useDialog } from '../../../../components/ui/DialogProvider';

import { ALL_COUNTRIES, flagToISO } from '../../../../lib/countries';

export default function InvitePage() {
  const { alert } = useDialog();
  const params = useParams();
  const token = params.token as string;

  const [isValidating, setIsValidating] = React.useState(true);
  const [inviteData, setInviteData] = React.useState<any>(null);
  const [errorMsg, setErrorMsg] = React.useState('');
  
  // Form mandatory fields state
  const [username, setUsername] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [phone, setPhone] = React.useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    
    api.get(`/auth/invite/${token}`)
      .then(res => {
        setInviteData(res.data);
        // Automatically compute a preliminary safe username from their name
        if (res.data.name) {
          const pre = res.data.name.toLowerCase().replace(/[^a-z0-9_]/g, '');
          setUsername(pre);
        }
        setIsValidating(false);
      })
      .catch(err => {
        setErrorMsg(err.response?.data?.message || 'This invitation link has expired or is invalid.');
        setIsValidating(false);
      });
  }, [token]);

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || username.length < 2) {
      await alert('Username must be at least 2 alphanumeric characters.', 'Validation Error');
      return;
    }

    if (!phone.trim() || phone.length < 6) {
      await alert('Please provide a valid contact phone number.', 'Validation Error');
      return;
    }

    if (password !== confirmPassword) {
      await alert('Passwords do not match', 'Validation Error');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await api.post(`/auth/invite/${token}`, { 
        password,
        username: username.toLowerCase().trim(),
        countryCode,
        phone: phone.trim()
      });
      
      // Store access token via import wrapper safely
      const apiModule = await import('../../../../lib/api');
      apiModule.setAccessToken(res.data.accessToken);
      
      // Forward immediately to the dashboard system
      window.location.href = '/dashboard';
    } catch (err: any) {
      await alert(err.response?.data?.message || 'Failed to create account', 'Error');
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className={styles.center}>
        <div className={styles.loader}></div>
        <p>Validating invitation...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={styles.card}>
        <div className={styles.iconError}>!</div>
        <h2>Invite Expired</h2>
        <p className={styles.desc}>{errorMsg}</p>
        <a href="/login" className={styles.btnLink}>Back to Login</a>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.badge}>Official Invite</div>
      <h1>Welcome, {inviteData?.name?.split(' ')[0]}!</h1>
      <p className={styles.subtitle}>Complete your registration to join the organization.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label>Confirm Your Email</label>
          <input value={inviteData?.email} disabled className={styles.disabledInput} />
        </div>

        <div className={styles.field}>
          <label>Choose Your Unique @Username</label>
          <div className={styles.usernameWrapper}>
            <span className={styles.atPrefix}>@</span>
            <input 
              required 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
              placeholder="e.g. natukaka" 
              className={styles.usernameField}
            />
          </div>
          <small className={styles.fieldHint}>Required for tagging in org chat. Only lowercase letters, numbers, and underscores.</small>
        </div>

        <div className={styles.field}>
          <label>Workspace Mobile Number</label>
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
              required
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
              placeholder="98765 43210"
              className={styles.phoneInput}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Create New Password</label>
          <div className={styles.passwordWrapper}>
            <input 
              type={showPassword ? 'text' : 'password'} 
              required 
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.passwordInput}
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

        <div className={styles.field}>
          <label>Confirm Password</label>
          <div className={styles.passwordWrapper}>
            <input 
              type={showConfirmPassword ? 'text' : 'password'} 
              required 
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.passwordInput}
            />
            <button 
              type="button"
              className={styles.toggleEyeBtn}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? (
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

        <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
          {isSubmitting ? 'Setting Up...' : 'Complete Sign Up'}
        </button>
      </form>
    </div>
  );
}
