"use client";
import React from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, getExistingSocket, disconnectSocket } from '../lib/socket';

/**
 * Returns the current access token from the in-memory cookie.
 * Only used for the *initial* socket creation.
 */
function getCookieToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith('accessToken='))
    ?.split('=')[1];
}

export function useSocket(): Socket | null {
  const [socket, setSocket] = React.useState<Socket | null>(() => {
    // On first render, try to reuse an existing socket or create one from the cookie token
    const existing = getExistingSocket();
    if (existing) return existing;
    const token = getCookieToken();
    return token ? getSocket(token) : null;
  });

  React.useEffect(() => {
    /**
     * Called when the accessTokenChanged event fires.
     * detail is the new token string, or null/undefined on logout.
     */
    const onTokenChanged = (e: CustomEvent<string | null>) => {
      const newToken = e.detail;

      if (!newToken) {
        // Logged out — disconnect everything
        disconnectSocket();
        setSocket(null);
        return;
      }

      const current = getExistingSocket();
      if (current && (current.auth as any)?.token === newToken) {
        // Same token, socket already exists — ensure it's connected
        if (!current.connected) current.connect();
        setSocket((prev) => (prev === current ? prev : current));
        return;
      }

      // New token (e.g. after refresh) — reconnect with updated auth
      const s = getSocket(newToken);
      setSocket(s);
    };

    // If no socket was created in the useState initializer (SSR hydration case), try now
    setSocket((prev) => {
      if (prev) return prev;
      const existing = getExistingSocket();
      if (existing) return existing;
      const token = getCookieToken();
      return token ? getSocket(token) : null;
    });

    window.addEventListener('accessTokenChanged', onTokenChanged as EventListener);
    return () => {
      window.removeEventListener('accessTokenChanged', onTokenChanged as EventListener);
    };
  }, []);

  return socket;
}
