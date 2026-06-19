import { Router } from 'express';
import * as ctrl from '../controllers/timeoff.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// All endpoints in this sub-router are protected
router.use(authenticate);

router.post('/holiday', authorize('admin', 'super_admin'), ctrl.createHoliday);
router.get('/holidays', ctrl.listHolidays);

router.post('/request', ctrl.requestTimeOff);
router.get('/my-requests', ctrl.listMyRequests);

router.get('/all-requests', authorize('admin', 'super_admin'), ctrl.listAllRequests);
router.patch('/request/:requestId', authorize('admin', 'super_admin'), ctrl.reviewRequest);

export default router;
