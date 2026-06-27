"use client";

import React from 'react';
import api from '../../../lib/api';
import styles from './register.module.css';

type OnboardingPath = 'create' | 'join';

export default function RegisterPage() {
  const [path, setPath] = React.useState<OnboardingPath>('create');

  // Path A Fields: Create Organization
  const [orgName, setOrgName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [adminName, setAdminName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');

  // Path B Fields: Join as Employee
  const [inviteSlug, setInviteSlug] = React.useState('');
  const [employeeName, setEmployeeName] = React.useState('');
  const [employeeEmail, setEmployeeEmail] = React.useState('');
  const [employeePassword, setEmployeePassword] = React.useState('');

  // Common UI states
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<{ [key: string]: string }>({});

  // Auto-generate slug from Org Name for Path A
  React.useEffect(() => {
    if (path === 'create') {
      const generated = orgName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // remove special chars
        .replace(/\s+/g, '-')         // replace spaces with hyphens
        .replace(/-+/g, '-')          // replace multiple hyphens
        .trim();
      setSlug(generated);
    }
  }, [orgName, path]);

  // Reset errors when path changes
  React.useEffect(() => {
    setErrorMsg('');
    setValidationErrors({});
    setIsLoading(false);
  }, [path]);

  const validate = () => {
    const errors: { [key: string]: string } = {};

    if (path === 'create') {
      if (!adminName.trim()) errors.adminName = 'Full name is required';
      if (!adminEmail.trim()) {
        errors.adminEmail = 'Work email is required';
      } else if (!/\S+@\S+\.\S+/.test(adminEmail)) {
        errors.adminEmail = 'Please enter a valid email address';
      }
      if (!orgName.trim()) errors.orgName = 'Company name is required';
      if (!slug.trim()) {
        errors.slug = 'Workspace slug is required';
      } else if (!/^[a-z0-9-]+$/.test(slug)) {
        errors.slug = 'Slug can only contain lowercase letters, numbers, and hyphens';
      }
      if (!adminPassword) {
        errors.adminPassword = 'Password is required';
      } else if (adminPassword.length < 8) {
        errors.adminPassword = 'Password must be at least 8 characters';
      }
    } else {
      if (!inviteSlug.trim()) errors.inviteSlug = 'Workspace slug or invite code is required';
      if (!employeeName.trim()) errors.employeeName = 'Full name is required';
      if (!employeeEmail.trim()) {
        errors.employeeEmail = 'Email address is required';
      } else if (!/\S+@\S+\.\S+/.test(employeeEmail)) {
        errors.employeeEmail = 'Please enter a valid email address';
      }
      if (!employeePassword) {
        errors.employeePassword = 'Password setup is required';
      } else if (employeePassword.length < 8) {
        errors.employeePassword = 'Password must be at least 8 characters';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    if (!validate()) {
      setIsLoading(false);
      return;
    }

    try {
      if (path === 'create') {
        const res = await api.post('/auth/register', {
          orgName: orgName.trim(),
          slug: slug.trim(),
          name: adminName.trim(),
          email: adminEmail.trim(),
          password: adminPassword
        });
        const { accessToken } = res.data;
        (await import('../../../lib/api')).setAccessToken(accessToken);
        window.location.href = '/dashboard';
      } else {
        const res = await api.post('/auth/register-employee', {
          slug: inviteSlug.trim(),
          name: employeeName.trim(),
          email: employeeEmail.trim(),
          password: employeePassword
        });
        const { accessToken } = res.data;
        (await import('../../../lib/api')).setAccessToken(accessToken);
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Registration failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.registerViewport}>
      <div className={styles.registerContainer}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logoMark} aria-hidden="true">
            <span className={styles.logoDot}></span>
          </div>
          <h1 className={styles.title}>Get started with Antigravity</h1>
          <p className={styles.subtitle}>Set up your organization dashboard or join your existing workspace.</p>
        </header>

        {/* Path Selector Cards */}
        <div className={styles.pathSelectorContainer} role="radiogroup" aria-label="Choose your onboarding path">
          <div
            className={`${styles.pathCard} ${path === 'create' ? styles.pathCardActive : ''}`}
            onClick={() => setPath('create')}
            role="radio"
            aria-checked={path === 'create'}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setPath('create'); }}
          >
            <div className={styles.pathIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m3 0h5m0 0V11m0 10V9" />
              </svg>
            </div>
            <div className={styles.pathInfo}>
              <h3 className={styles.pathTitle}>I want to set up my company</h3>
              <p className={styles.pathDesc}>Create a new organization workspace and invite your team.</p>
            </div>
            {path === 'create' && <div className={styles.badgeCheck}>✓</div>}
          </div>

          <div
            className={`${styles.pathCard} ${path === 'join' ? styles.pathCardActive : ''}`}
            onClick={() => setPath('join')}
            role="radio"
            aria-checked={path === 'join'}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setPath('join'); }}
          >
            <div className={styles.pathIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8z" />
                <path d="M21 8v6m-3-3h6" />
              </svg>
            </div>
            <div className={styles.pathInfo}>
              <h3 className={styles.pathTitle}>I have an invite code</h3>
              <p className={styles.pathDesc}>Join an existing team using your workspace slug or invite details.</p>
            </div>
            {path === 'join' && <div className={styles.badgeCheck}>✓</div>}
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className={styles.errorBanner} role="alert">
            <svg className={styles.errorIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Onboarding Form Card */}
        <div className={styles.formCard}>
          <form onSubmit={handleRegister} className={styles.form} noValidate>
            {path === 'create' ? (
              /* PATH A: CREATE ORGANIZATION */
              <>
                <div className={styles.rowFields}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="adminName" className={styles.label}>
                      Full name
                    </label>
                    <input
                      id="adminName"
                      type="text"
                      placeholder="Jane Doe"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.adminName ? styles.inputFieldError : ''}`}
                      required
                    />
                    {validationErrors.adminName && (
                      <span className={styles.fieldErrorText} role="alert">
                        {validationErrors.adminName}
                      </span>
                    )}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="adminEmail" className={styles.label}>
                      Work email
                    </label>
                    <input
                      id="adminEmail"
                      type="email"
                      placeholder="jane@company.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.adminEmail ? styles.inputFieldError : ''}`}
                      required
                    />
                    {validationErrors.adminEmail && (
                      <span className={styles.fieldErrorText} role="alert">
                        {validationErrors.adminEmail}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="orgName" className={styles.label}>
                    Organization name
                  </label>
                  <input
                    id="orgName"
                    type="text"
                    placeholder="Acme Corp"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className={`${styles.inputField} ${validationErrors.orgName ? styles.inputFieldError : ''}`}
                    required
                  />
                  {validationErrors.orgName && (
                    <span className={styles.fieldErrorText} role="alert">
                      {validationErrors.orgName}
                    </span>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="slug" className={styles.label}>
                    Workspace slug
                  </label>
                  <div className={styles.slugInputWrapper}>
                    <input
                      id="slug"
                      type="text"
                      placeholder="acme-corp"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className={`${styles.inputField} ${styles.slugInput} ${validationErrors.slug ? styles.inputFieldError : ''}`}
                      required
                    />
                    <span className={styles.slugSuffix}>.antigravity.com</span>
                  </div>
                  <p className={styles.hintText}>
                    This is your unique workspace URL. Letters, numbers, and hyphens only.
                  </p>
                  {validationErrors.slug && (
                    <span className={styles.fieldErrorText} role="alert">
                      {validationErrors.slug}
                    </span>
                  )}
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="adminPassword" className={styles.label}>
                    Password
                  </label>
                  <div className={styles.passwordWrapper}>
                    <input
                      id="adminPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.adminPassword ? styles.inputFieldError : ''}`}
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
                  {validationErrors.adminPassword && (
                    <span className={styles.fieldErrorText} role="alert">
                      {validationErrors.adminPassword}
                    </span>
                  )}
                </div>

                <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                  {isLoading ? (
                    <span className={styles.loaderWrapper}>
                      <span className={styles.spinner}></span>
                      Creating workspace...
                    </span>
                  ) : (
                    'Create Workspace'
                  )}
                </button>
              </>
            ) : (
              /* PATH B: JOIN AS EMPLOYEE */
              <>
                <div className={styles.inputGroup}>
                  <label htmlFor="inviteSlug" className={styles.label}>
                    Invite code or workspace slug
                  </label>
                  <input
                    id="inviteSlug"
                    type="text"
                    placeholder="e.g. acme-corp"
                    value={inviteSlug}
                    onChange={(e) => setInviteSlug(e.target.value)}
                    className={`${styles.inputField} ${validationErrors.inviteSlug ? styles.inputFieldError : ''}`}
                    required
                  />
                  {validationErrors.inviteSlug && (
                    <span className={styles.fieldErrorText} role="alert">
                      {validationErrors.inviteSlug}
                    </span>
                  )}
                </div>

                <div className={styles.rowFields}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="employeeName" className={styles.label}>
                      Full name
                    </label>
                    <input
                      id="employeeName"
                      type="text"
                      placeholder="Jane Doe"
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.employeeName ? styles.inputFieldError : ''}`}
                      required
                    />
                    {validationErrors.employeeName && (
                      <span className={styles.fieldErrorText} role="alert">
                        {validationErrors.employeeName}
                      </span>
                    )}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="employeeEmail" className={styles.label}>
                      Email address
                    </label>
                    <input
                      id="employeeEmail"
                      type="email"
                      placeholder="jane@example.com"
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.employeeEmail ? styles.inputFieldError : ''}`}
                      required
                    />
                    {validationErrors.employeeEmail && (
                      <span className={styles.fieldErrorText} role="alert">
                        {validationErrors.employeeEmail}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="employeePassword" className={styles.label}>
                    Password setup
                  </label>
                  <div className={styles.passwordWrapper}>
                    <input
                      id="employeePassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={employeePassword}
                      onChange={(e) => setEmployeePassword(e.target.value)}
                      className={`${styles.inputField} ${validationErrors.employeePassword ? styles.inputFieldError : ''}`}
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
                  {validationErrors.employeePassword && (
                    <span className={styles.fieldErrorText} role="alert">
                      {validationErrors.employeePassword}
                    </span>
                  )}
                </div>

                <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                  {isLoading ? (
                    <span className={styles.loaderWrapper}>
                      <span className={styles.spinner}></span>
                      Joining workspace...
                    </span>
                  ) : (
                    'Join Organization'
                  )}
                </button>
              </>
            )}
          </form>
        </div>

        {/* Footer */}
        <p className={styles.footerText}>
          Already have an account? <a href="/login" className={styles.link}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
