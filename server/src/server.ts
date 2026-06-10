import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { connectDB } from './config/db';
import { PORT, CLIENT_URL, NODE_ENV } from './config/env';
import { initChatGateway } from './gateway/chat.gateway';

const start = async () => {
  await connectDB();
  const app = createApp();

  // Create HTTP server so Socket.IO can share the same port
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: NODE_ENV === 'production' ? CLIENT_URL : true,
      credentials: true,
    },
  });

  // Initialize the chat/notification gateway
  initChatGateway(io);

  httpServer.listen(PORT, () => {
    console.info(`Server running on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

