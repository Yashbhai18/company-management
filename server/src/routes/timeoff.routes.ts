import { Router } from 'express';
import * as ctrl from '../controllers/timeoff.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All endpoints in this sub-router are protected
router.use(authenticate);

router.post('/holiday', ctrl.createHoliday);
router.get('/holidays', ctrl.listHolidays);

router.post('/request', ctrl.requestTimeOff);
router.get('/my-requests', ctrl.listMyRequests);

router.get('/all-requests', ctrl.listAllRequests);
router.patch('/request/:requestId', ctrl.reviewRequest);

export default router;
