import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getDashboardData } from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);

router.get('/', getDashboardData);

export default router;
