import { Router } from 'express';
import * as ctrl from '../controllers/organization.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.get('/locations', ctrl.getLocations);
router.post('/locations', ctrl.addLocation);
router.patch('/locations/:id', ctrl.updateLocation);
router.delete('/locations/:id', ctrl.deleteLocation);

export default router;
