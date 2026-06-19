import { Router } from 'express';
import * as ctrl from '../controllers/organization.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get('/locations', ctrl.getLocations);
router.post('/locations', authorize('admin', 'super_admin'), ctrl.addLocation);
router.patch('/locations/:id', authorize('admin', 'super_admin'), ctrl.updateLocation);
router.delete('/locations/:id', authorize('admin', 'super_admin'), ctrl.deleteLocation);

export default router;
