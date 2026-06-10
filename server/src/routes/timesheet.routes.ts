import { Router } from 'express';
import * as ctrl from '../controllers/timesheet.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All routes must be protected
router.use(authenticate);

router.get('/', ctrl.getHistory);
router.get('/salary-sheet', ctrl.getMonthlySalarySheet);
router.get('/active', ctrl.getActiveShift);
router.post('/in', ctrl.clockIn);
router.post('/out', ctrl.clockOut);

export default router;
