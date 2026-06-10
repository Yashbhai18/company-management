import { Router } from 'express';
import * as ctrl from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/', authenticate, ctrl.getMembers);
router.get('/stats', authenticate, ctrl.getDashboardStats);
router.patch('/avatar', authenticate, ctrl.updateAvatar);
router.patch('/profile', authenticate, ctrl.updateProfile);
router.patch('/password', authenticate, ctrl.updatePassword);
router.patch('/:id', authenticate, ctrl.updateMemberByAdmin);
router.delete('/:id', authenticate, ctrl.deleteMember);

export default router;
