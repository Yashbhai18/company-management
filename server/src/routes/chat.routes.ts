import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { 
  getOrgMessages, 
  getConversations, 
  getDmHistory, 
  getOrgMembers,
  createGroupConversation,
  getConversationMessages
} from '../controllers/chat.controller';

const router = Router();

router.use(authenticate);

router.get('/org', getOrgMessages);
router.get('/members', getOrgMembers);
router.get('/conversations', getConversations);
router.get('/conversations/:conversationId', getConversationMessages);
router.get('/dm/:recipientId', getDmHistory);
router.post('/group', createGroupConversation);

export default router;
