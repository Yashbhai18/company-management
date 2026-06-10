import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as ctrl from '../controllers/notification.controller';

const router = Router();

router.get('/', authenticate, ctrl.getNotifications);
router.post('/read-all', authenticate, ctrl.markAllRead);
router.post('/:notificationId/read', authenticate, ctrl.markRead);
router.delete('/:notificationId', authenticate, ctrl.deleteNotification);

export default router;
