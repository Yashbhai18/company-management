import { Router } from 'express';
import * as ctrl from '../controllers/task.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, ctrl.getTasks);
router.post('/', authenticate, authorize('admin', 'super_admin'), ctrl.createTasks);
router.patch('/stages', authenticate, authorize('admin', 'super_admin'), ctrl.addKanbanStage);
router.delete('/stages/:stageName', authenticate, authorize('admin', 'super_admin'), ctrl.deleteKanbanStage);
router.patch('/:id/complete', authenticate, ctrl.completeTask);
router.patch('/:id/stage', authenticate, ctrl.updateTaskStage);
router.patch('/:id', authenticate, ctrl.updateTask);

export default router;
