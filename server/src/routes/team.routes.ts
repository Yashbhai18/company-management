import { Router } from 'express';
import * as ctrl from '../controllers/team.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// Standard authenticate secures base lists, specific permissions secure mutations
router.get('/', authenticate, ctrl.getTeams);
router.post('/', authenticate, authorize('admin', 'super_admin'), ctrl.createTeam);
router.delete('/:id', authenticate, authorize('admin', 'super_admin'), ctrl.deleteTeam);

export default router;
