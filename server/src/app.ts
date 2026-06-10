import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import timesheetRoutes from './routes/timesheet.routes';
import userRoutes from './routes/user.routes';
import timeoffRoutes from './routes/timeoff.routes';
import notificationRoutes from './routes/notification.routes';
import chatRoutes from './routes/chat.routes';
import teamRoutes from './routes/team.routes';
import taskRoutes from './routes/task.routes';
import organizationRoutes from './routes/organization.routes';
import { CLIENT_URL, NODE_ENV } from './config/env';

/** Create and configure express app */
export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: NODE_ENV === 'production' ? CLIENT_URL : true,
      credentials: true,
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/timesheets', timesheetRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/time-off', timeoffRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/organization', organizationRoutes);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
  });

  return app;
};
