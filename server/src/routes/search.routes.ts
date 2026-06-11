import { Router } from 'express';
import { searchAll } from '../controllers/search.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/', authenticate, searchAll);

export default router;
