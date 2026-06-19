"use client";
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../../../../lib/api';
import styles from './verify.module.css';

function VerifyMagicLinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = React.useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No verification token provided in URL.');
      return;
    }

    api.get(`/auth/verify`, { params: { token } })
      .then(async (res) => {
        const { accessToken } = res.data;
        const apiModule = await import('../../../../lib/api');
        apiModule.setAccessToken(accessToken);
        setStatus('success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.message || 'The verification link may have expired or is invalid.');
      });
  }, [token]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {status === 'verifying' && (
          <div className={styles.loadingState}>
            <div className={styles.loader}></div>
            <h2>Verifying Link...</h2>
            <p className={styles.desc}>Please wait while we authenticate your request.</p>
          </div>
        )}

        {status === 'success' && (
          <div className={styles.successState}>
            <div className={styles.iconSuccess}>✓</div>
            <h2>Sign In Verified!</h2>
            <p className={styles.desc}>Authentication successful. Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className={styles.errorState}>
            <div className={styles.iconError}>!</div>
            <h2>Verification Failed</h2>
            <p className={styles.desc}>{errorMsg}</p>
            <a href="/login" className={styles.btnLink}>Return to Sign In</a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyMagicLinkPage() {
  return (
    <Suspense fallback={
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <div className={styles.loader}></div>
            <h2>Loading Verification...</h2>
            <p className={styles.desc}>Preparing the verification environment.</p>
          </div>
        </div>
      </div>
    }>
      <VerifyMagicLinkContent />
    </Suspense>
  );
}
