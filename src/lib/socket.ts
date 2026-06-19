import { io, Socket } from 'socket.io-client';

const globalWithSocket = globalThis as typeof globalThis & {
  socket?: Socket;
};

let socket: Socket | null = globalWithSocket.socket || null;

/** Get or create the singleton socket instance, authenticated with the given token */
export function getSocket(token: string): Socket {
  // If we already have a socket with this same token, reuse it
  if (socket && (socket.auth as any)?.token === token) {
    // Re-connect if it was disconnected
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // Disconnect any stale socket before creating a new one
  if (socket) {
    socket.disconnect();
    socket = null;
    globalWithSocket.socket = undefined;
  }

  let socketURL = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!socketURL) {
    const apiURL = process.env.NEXT_PUBLIC_API_URL;
    if (apiURL) {
      try {
        const url = new URL(apiURL);
        socketURL = url.origin;
      } catch {
        socketURL = apiURL.replace(/\/api\/?$/, '');
      }
    } else {
      socketURL = 'http://localhost:4000';
    }
  }

  socket = io(socketURL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  globalWithSocket.socket = socket;
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    globalWithSocket.socket = undefined;
  }
}

export function getExistingSocket(): Socket | null {
  return socket;
}
