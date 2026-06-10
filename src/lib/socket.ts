import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Get or create the singleton socket instance, authenticated with the given token */
export function getSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  // Disconnect any stale socket
  if (socket) socket.disconnect();

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getExistingSocket(): Socket | null {
  return socket;
}
