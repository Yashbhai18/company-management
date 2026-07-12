import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export const initSocketGateway = (io: SocketIOServer) => {
  ioInstance = io;

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });
};

export const getSocketIO = (): SocketIOServer | null => {
  return ioInstance;
};
