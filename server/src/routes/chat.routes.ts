import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getOrgMessages, getConversations, getDmHistory, getOrgMembers } from '../controllers/chat.controller';

const router = Router();

router.use(authenticate);

router.get('/org', getOrgMessages);
router.get('/members', getOrgMembers);
router.get('/conversations', getConversations);
router.get('/dm/:recipientId', getDmHistory);

export default router;
