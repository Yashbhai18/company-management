"use client";
import React from 'react';
import api from '../../../lib/api';
import styles from './forgot-password.module.css';

export default function ForgotPasswordPage() {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [email, setEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  
  const [isForced, setIsForced] = React.useState(false);
  const [forcedMsg, setForcedMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Parse search params on mount to check if this is a forced reset
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forced') === 'true') {
        setIsForced(true);
        const storedEmail = sessionStorage.getItem('resetPasswordEmail');
        const storedMsg = sessionStorage.getItem('resetPasswordMessage');
        if (storedEmail) {
          setEmail(storedEmail);
          setStep(2);
        }
        if (storedMsg) {
          setForcedMsg(storedMsg);
        } else {
          setForcedMsg('For security reasons, you must change your password before logging in.');
        }
      }
    }
  }, []);

  // Password rules checks
  const isLenValid = password.length >= 8 && password.length <= 12;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isConfirmValid = password && password === confirmPassword;

  const isPasswordStrong = isLenValid && hasLower && hasUpper && hasNumber && hasSpecial;

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setSuccessMsg(res.data.message || 'OTP sent successfully!');
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to send verification code. Please check your email.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!isPasswordStrong) {
      setErrorMsg('Password does not meet the complexity requirements.');
      return;
    }

    if (!isConfirmValid) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email,
        otp,
        password
      });
      setSuccessMsg(res.data.message || 'Password reset successfully!');
      
      // Clear session storage values
      sessionStorage.removeItem('resetPasswordEmail');
      sessionStorage.removeItem('resetPasswordMessage');
      
      // Redirect to login page in 3 seconds
      setTimeout(() => {
        window.location.href = '/login';
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to reset password. Please check your OTP and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.glassContainer}>
      <div className={styles.header}>
        <h1 className={styles.title}>Reset Password</h1>
        <p className={styles.subtitle}>
          {step === 1 
            ? 'Enter your email to receive a password reset verification code.' 
            : `Set a new password for ${email}.`}
        </p>
      </div>

      {isForced && forcedMsg && step === 2 && !successMsg && (
        <div className={styles.warningMessage}>{forcedMsg}</div>
      )}
      
      {errorMsg && <div className={styles.errorMessage}>{errorMsg}</div>}
      {successMsg && <div className={styles.successMessage}>{successMsg}</div>}

      {step === 1 ? (
        <form onSubmit={handleSendOtp} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email Address</label>
            <input 
              type="email"
              className={styles.input} 
              placeholder="Enter your registered email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
            />
          </div>
          
          <button type="submit" className={styles.submitBtn} disabled={isLoading}>
            {isLoading ? <span className={styles.loader}></span> : 'Send Verification Code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className={styles.form}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Verification Code (6 Digits)</label>
            <input 
              type="text"
              maxLength={6}
              className={styles.input} 
              placeholder="123456" 
              value={otp} 
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))} 
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label}>New Password</label>
            <input 
              type="password"
              className={styles.input} 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
            />
          </div>

          {/* Password Requirements Checklist */}
          {password && (
            <div className={styles.passwordRequirements}>
              <div className={styles.requirementsTitle}>Password Requirements</div>
              <ul className={styles.requirementsList}>
                <li className={`${styles.requirementItem} ${isLenValid ? styles.reqMet : styles.reqUnmet}`}>
                  <span className={styles.bullet}></span> Between 8 and 12 characters
                </li>
                <li className={`${styles.requirementItem} ${hasLower ? styles.reqMet : styles.reqUnmet}`}>
                  <span className={styles.bullet}></span> One lowercase letter
                </li>
                <li className={`${styles.requirementItem} ${hasUpper ? styles.reqMet : styles.reqUnmet}`}>
                  <span className={styles.bullet}></span> One uppercase letter
                </li>
                <li className={`${styles.requirementItem} ${hasNumber ? styles.reqMet : styles.reqUnmet}`}>
                  <span className={styles.bullet}></span> One numeric digit
                </li>
                <li className={`${styles.requirementItem} ${hasSpecial ? styles.reqMet : styles.reqUnmet}`}>
                  <span className={styles.bullet}></span> One special symbol
                </li>
              </ul>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label className={styles.label}>Confirm New Password</label>
            <input 
              type="password"
              className={styles.input} 
              placeholder="••••••••" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              required
            />
          </div>

          {confirmPassword && (
            <div style={{ marginTop: '-0.5rem', paddingLeft: '0.25rem' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                color: isConfirmValid ? 'var(--success)' : 'var(--error)' 
              }}>
                {isConfirmValid ? '✓ Passwords match' : '✗ Passwords do not match'}
              </span>
            </div>
          )}
          
          <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={isLoading || !isPasswordStrong || !isConfirmValid}
          >
            {isLoading ? <span className={styles.loader}></span> : 'Reset Password'}
          </button>

          {!isForced && (
            <button 
              type="button" 
              onClick={() => { setStep(1); setOtp(''); setPassword(''); setConfirmPassword(''); setErrorMsg(''); setSuccessMsg(''); }} 
              className={styles.submitBtn}
              style={{
                background: 'var(--canvas-soft)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-color)',
                marginTop: '-0.5rem'
              }}
            >
              Request a New Code
            </button>
          )}
        </form>
      )}

      <p className={styles.footerText}>
        Remember your password? <a href="/login" className={styles.link}>Back to Sign In</a>
      </p>
    </div>
  );
}
