import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { sanitizeMiddleware } from './middleware/sanitize';
import authRoutes from './routes/auth.routes';
import timesheetRoutes from './routes/timesheet.routes';
import userRoutes from './routes/user.routes';
import timeoffRoutes from './routes/timeoff.routes';
import notificationRoutes from './routes/notification.routes';
import teamRoutes from './routes/team.routes';
import taskRoutes from './routes/task.routes';
import organizationRoutes from './routes/organization.routes';
import searchRoutes from './routes/search.routes';
import slackRoutes from './routes/slack.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { CLIENT_URL, NODE_ENV } from './config/env';

/** Create and configure express app */
export const createApp = () => {
  const app = express();
  if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(express.json({ 
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      // Preserve raw body for Slack signature verification
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: NODE_ENV === 'production' ? CLIENT_URL : true,
      credentials: true,
    })
  );

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: NODE_ENV === 'production' ? 1000 : 10000, // 1000 requests in production, 10000 in development
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(globalLimiter);

  app.use(sanitizeMiddleware);

  app.use('/api/auth', authRoutes);
  app.use('/api/timesheets', timesheetRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/time-off', timeoffRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/organization', organizationRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/slack', slackRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
  });

  return app;
};
