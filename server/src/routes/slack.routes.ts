import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { verifySlackSignature } from '../middleware/verifySlackSignature';
import { verifySlackConnected } from '../middleware/verifySlackConnected';
import * as ctrl from '../controllers/slack.controller';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Public: Slack Events Webhook (Slack signs these, no JWT) ─────────────────
router.post('/events', verifySlackSignature, ctrl.handleSlackEvent);

// ── Public redirect: OAuth callback (no JWT — user is returning from Slack) ──
router.get('/oauth/callback', ctrl.handleOAuthCallback);
router.get('/user/callback', ctrl.handleOAuthCallback);

// ── Protected routes (require JWT) ───────────────────────────────────────────
router.use(authenticate);

// User OAuth & Status
router.get('/user/connect', ctrl.getUserOAuthUrl);
router.delete('/user/disconnect', ctrl.disconnectUserAccount);
router.get('/user/status', ctrl.getUserSlackStatus);

// OAuth
router.get('/oauth', ctrl.getOAuthUrl);
router.delete('/disconnect', ctrl.disconnectWorkspace);
router.delete('/user-connection', ctrl.disconnectUserAccount);

// Workspace info
router.get('/workspace', ctrl.getWorkspace);
router.post('/sync', ctrl.triggerSync);

// Users
router.get('/users', ctrl.getUsers);
router.get('/users/:id', ctrl.getUser);

// Channels
router.get('/channels', ctrl.getChannels);
router.get('/channels/:channelId/members', ctrl.getChannelMembers);
router.post('/channel', ctrl.createChannel);
router.post('/channel/dm', ctrl.openDMConversation);
router.patch('/channel', ctrl.updateChannel);

// Messages
router.get('/messages/:channelId', ctrl.getMessages);
router.post('/message', verifySlackConnected, ctrl.postMessage);
router.patch('/message', verifySlackConnected, ctrl.editMessage);
router.delete('/message', verifySlackConnected, ctrl.deleteMessage);

// Threads
router.get('/thread/:channelId/:threadTs', ctrl.getThread);
router.post('/thread', verifySlackConnected, ctrl.postThreadReply);

// Files
router.get('/file/proxy', verifySlackConnected, ctrl.proxyFile);
router.post('/file', verifySlackConnected, upload.array('files'), ctrl.uploadFile);
router.delete('/file/:fileId', verifySlackConnected, ctrl.deleteFile);

// Search
router.get('/search', ctrl.search);

// File Content & Thumbnails
router.get('/files/:fileId/thumbnail', verifySlackConnected, ctrl.getThumbnail);
router.get('/files/:fileId', verifySlackConnected, ctrl.getFileContent);

export default router;
