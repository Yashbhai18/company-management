"use client";
import React from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '../lib/socket';

/**
 * Hook that initialises the socket connection using the access token stored
 * in the browser cookie (set by api.ts / setAccessToken).
 * Returns the connected socket instance.
 */
export function useSocket(): Socket | null {
  const [socket, setSocket] = React.useState<Socket | null>(null);

  React.useEffect(() => {
    // Read token from in-memory cookie set by setAccessToken()
    const cookieToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('accessToken='))
      ?.split('=')[1];

    if (!cookieToken) return;

    const s = getSocket(cookieToken);
    setSocket(s);

    // No cleanup disconnect — socket is a singleton shared across components
    return () => {};
  }, []);

  return socket;
}
