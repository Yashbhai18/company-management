import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { connectDB } from './config/db';
import { PORT, CLIENT_URL, NODE_ENV } from './config/env';
import { initChatGateway } from './gateway/chat.gateway';

const start = async () => {
  await connectDB();

  // Run migration to flag existing users to change their password
  try {
    const { User } = await import('./models/User');
    const res = await User.updateMany(
      { mustChangePassword: { $exists: false } },
      { $set: { mustChangePassword: true } }
    );
    if (res.modifiedCount > 0) {
      console.info(`Migrated ${res.modifiedCount} existing users to require a password reset.`);
    }
  } catch (err) {
    console.error('Failed to run mustChangePassword migration:', err);
  }

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

