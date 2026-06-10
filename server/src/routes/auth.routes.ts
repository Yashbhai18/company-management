import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { NODE_ENV } from '../config/env';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 5 : 100, // Relaxed limit for local development
  message: { message: 'Too many requests, please try again later.' }, // JSON response for frontend
  standardHeaders: true,
  legacyHeaders: false
});

const mfaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: NODE_ENV === 'production' ? 5 : 50,
  message: { message: 'Too many 2FA verification attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/register', ctrl.register);
router.post('/register-employee', ctrl.registerEmployee);
router.post('/expand-org', authenticate, ctrl.expandOrganization);
router.get('/my-orgs', authenticate, ctrl.getMyOrgs);
router.post('/switch-org', authenticate, ctrl.switchOrg);
router.post('/login', authLimiter, ctrl.login);
router.post('/verify-2fa', mfaLimiter, ctrl.verify2fa);
router.post('/2fa/setup', authenticate, authorize('super_admin', 'admin'), ctrl.setup2fa);
router.post('/2fa/enable', authenticate, authorize('super_admin', 'admin'), ctrl.enable2fa);
router.post('/2fa/disable', authenticate, authorize('super_admin', 'admin'), ctrl.disable2fa);
router.delete('/2fa/devices/:deviceId', authenticate, authorize('super_admin', 'admin'), ctrl.delete2faDevice);
router.post('/2fa/regenerate-backup-codes', authenticate, authorize('super_admin', 'admin'), ctrl.regenerateBackupCodes);
router.post('/magic-link', authLimiter, ctrl.requestMagicLink);
router.get('/verify', ctrl.verifyMagic);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.post('/invite', authenticate, authorize('super_admin', 'admin'), ctrl.invite);
router.get('/invite/:token', ctrl.validateInvite);
router.post('/invite/:token', ctrl.completeInvite);
router.post('/claim-invite', authenticate, ctrl.claimInvite);
router.post('/join-by-slug', authenticate, ctrl.joinBySlug);
router.get('/join-requests', authenticate, ctrl.getOrgJoinRequests);
router.get('/my-join-requests', authenticate, ctrl.getUserJoinRequests);
router.post('/resolve-join-request', authenticate, ctrl.resolveJoinRequest);
router.get('/me', authenticate, ctrl.me);

export default router;
