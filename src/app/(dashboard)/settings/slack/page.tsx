'use client';
import React from 'react';
import { useSearchParams } from 'next/navigation';
import slackApi, { SlackWorkspaceInfo } from '../../../../lib/slackApi';
import { useAuth } from '../../../../hooks/useAuth';
import styles from './slack-settings.module.css';

export default function SlackSettingsPage() {
  const searchParams = useSearchParams();
  const { user, whoami } = useAuth();
  const [workspace, setWorkspace] = React.useState<SlackWorkspaceInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [userDisconnecting, setUserDisconnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const successParam = searchParams.get('success');
  const errorParam = searchParams.get('error');
  const workspaceParam = searchParams.get('workspace');

  React.useEffect(() => {
    if (!user) {
      whoami().catch(() => {});
    }
  }, [user, whoami]);

  React.useEffect(() => {
    if (successParam === '1') {
      setSuccess(`✅ Successfully connected to ${workspaceParam || 'Slack'}!`);
    } else if (successParam === 'user_connected') {
      setSuccess('✅ Successfully linked your personal Slack account!');
    } else if (errorParam) {
      const messages: Record<string, string> = {
        oauth_failed: 'Slack connection failed. Please try again.',
        invalid_state: 'Invalid OAuth state. Please try again.',
        missing_params: 'Missing OAuth parameters. Please try again.',
      };
      setError(messages[errorParam] || `Connection error: ${errorParam}`);
    }
  }, [successParam, errorParam, workspaceParam]);

  const loadWorkspace = React.useCallback(async () => {
    setLoading(true);
    try {
      const ws = await slackApi.getWorkspace();
      setWorkspace(ws);
    } catch {
      setError('Failed to load workspace info');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const handleConnectWorkspace = async () => {
    try {
      const { url } = await slackApi.getOAuthUrl('workspace');
      window.location.href = url;
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to generate OAuth URL';
      setError(errMsg);
    }
  };

  const handleConnectUser = async () => {
    try {
      const { url } = await slackApi.getOAuthUrl('user');
      window.location.href = url;
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to generate OAuth URL';
      setError(errMsg);
    }
  };

  const handleDisconnectWorkspace = async () => {
    if (!confirm('Disconnect Slack workspace? This will stop all real-time sync for the entire organization.')) return;
    setDisconnecting(true);
    try {
      await slackApi.disconnect();
      setWorkspace({ connected: false });
      setSuccess('Slack workspace disconnected.');
    } catch {
      setError('Failed to disconnect workspace.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDisconnectUser = async () => {
    if (!confirm('Disconnect your personal Slack account? Your messages will fall back to using the bot-level identity.')) return;
    setUserDisconnecting(true);
    try {
      await slackApi.disconnectUser();
      if (workspace) {
        setWorkspace({
          ...workspace,
          userConnected: false,
          userSlackUserId: null
        });
      }
      setSuccess('Your Slack account has been unlinked.');
    } catch {
      setError('Failed to unlink Slack account.');
    } finally {
      setUserDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await slackApi.triggerSync();
      setSuccess('Manual sync started. Channels and messages will refresh shortly.');
      setTimeout(loadWorkspace, 3000);
    } catch {
      setError('Failed to trigger sync.');
    } finally {
      setSyncing(false);
    }
  };

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>🔗</div>
        <div>
          <h1 className={styles.title}>Slack Integration Settings</h1>
          <p className={styles.subtitle}>
            Link Slack workspaces and personal user accounts to manage collaboration dynamically.
          </p>
        </div>
      </div>

      {error && (
        <div className={styles.alert + ' ' + styles.alertError}>
          {error}
          <button className={styles.alertClose} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {success && (
        <div className={styles.alert + ' ' + styles.alertSuccess}>
          {success}
          <button className={styles.alertClose} onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <span>Loading Slack configuration…</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Section 1: Admin Workspace Integration */}
          {isAdmin && (
            <div className={styles.connectCard} style={{ borderLeft: '4px solid var(--primary)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🏢 Workspace Organization Connection
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Administrative setup for syncing channels, workspace members, and message history database cache.
              </p>

              {workspace?.connected ? (
                <div>
                  <div className={styles.workspaceInfo} style={{ marginBottom: '1rem' }}>
                    <div className={styles.workspaceLogo}>
                      {workspace.teamName?.[0]?.toUpperCase() || 'S'}
                    </div>
                    <div>
                      <div className={styles.workspaceName}>{workspace.teamName}</div>
                      <div className={styles.workspaceId}>Workspace ID: {workspace.workspaceId}</div>
                    </div>
                  </div>

                  {workspace.lastSyncedAt && (
                    <div className={styles.syncInfo} style={{ marginBottom: '1rem' }}>
                      Last synced: {new Date(workspace.lastSyncedAt).toLocaleString()}
                    </div>
                  )}

                  <div className={styles.scopeList} style={{ marginBottom: '1.5rem' }}>
                    <div className={styles.scopeTitle}>Bot Token Scopes</div>
                    <div className={styles.scopeTags}>
                      {workspace.scope?.split(',').map((s) => (
                        <span key={s} className={styles.scopeTag}>{s.trim()}</span>
                      ))}
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                      {syncing ? '⏳ Syncing…' : '🔄 Sync Now'}
                    </button>
                    <button className={styles.disconnectBtn} onClick={handleDisconnectWorkspace} disabled={disconnecting}>
                      {disconnecting ? 'Disconnecting…' : '🔌 Disconnect Workspace'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    No workspace linked. Connect the Slack app to establish workspace synchronization.
                  </p>
                  <button className={styles.connectBtn} onClick={handleConnectWorkspace}>
                    ⚡ Connect Slack Workspace
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Personal Slack Account Linking */}
          <div className={styles.connectCard} style={{ borderLeft: '4px solid #10b981' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              👤 Personal Slack Profile Linking
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Allows you to authorize the app to post messages as your actual Slack user profile instead of a bot.
            </p>

            {!workspace?.connected ? (
              <div style={{ padding: '1rem', backgroundColor: 'var(--surface-overlay)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                ⚠️ An administrator must connect the organization's Slack Workspace before you can link your personal profile.
              </div>
            ) : workspace.userConnected ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    ✔
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-color)' }}>Slack Account Connected</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Slack User ID: {workspace.userSlackUserId}</div>
                  </div>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Your messages will appear under your real Slack name and profile picture.
                </p>
                <button className={styles.disconnectBtn} onClick={handleDisconnectUser} disabled={userDisconnecting}>
                  {userDisconnecting ? 'Unlinking…' : '🔌 Unlink Personal Slack Account'}
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Not currently connected. Link your profile to write to Slack directly under your name.
                </p>
                <button className={styles.connectBtn} onClick={handleConnectUser} style={{ backgroundColor: '#10b981' }}>
                  ⚡ Link Your Slack Account
                </button>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
