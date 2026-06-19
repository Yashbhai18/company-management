import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import type { TokenPayload } from '../utils/token';
import { NODE_ENV, CLIENT_URL } from '../config/env';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: (NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 3600 * 1000
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: (NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax'
};


/** Register org + super_admin */
export const register = async (req: Request, res: Response) => {
  const schema = z.object({ orgName: z.string().min(1), slug: z.string().min(1), name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional(), password: z.string().min(8) });
  try {
    const body = schema.parse(req.body);
    const result = await authService.registerOrganization({ orgName: body.orgName, slug: body.slug, name: body.name, email: body.email, phone: body.phone, password: body.password });
    // set refresh cookie
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.status(201).json({ user: result.user, org: result.org, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Registration failed' });
  }
};

/** Direct Employee register into specific slug */
export const registerEmployee = async (req: Request, res: Response) => {
  const schema = z.object({ slug: z.string().min(1), name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });
  try {
    const body = schema.parse(req.body);
    const result = await authService.registerEmployee({ slug: body.slug, name: body.name, email: body.email, password: body.password });
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.status(201).json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Employee registration failed' });
  }
};

/** Expand org under current credentials */
export const expandOrganization = async (req: Request, res: Response) => {
  const schema = z.object({ orgName: z.string().min(1), slug: z.string().min(1) });
  try {
    const user = (req as any).user as TokenPayload;
    const body = schema.parse(req.body);
    const result = await authService.expandOrganization(user.userId, { orgName: body.orgName, slug: body.slug });
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.status(201).json({ user: result.user, org: result.org, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Expansion failed' });
  }
};

/** Fetch concurrent user organizations */
export const getMyOrgs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const orgs = await authService.getMyOrganizations(user.userId);
    return res.json({ orgs });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Hot swap into specified context directly */
export const switchOrg = async (req: Request, res: Response) => {
  const schema = z.object({ orgId: z.string() });
  try {
    const user = (req as any).user as TokenPayload;
    const body = schema.parse(req.body);
    const result = await authService.switchOrganization(user.userId, body.orgId);
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Switch failed' });
  }
};

/** Login with password (triggers email notification) */
export const login = async (req: Request, res: Response) => {
  const schema = z.object({ 
    identifier: z.string(), 
    password: z.string(), 
    rememberMe: z.boolean().optional(),
    targetRole: z.enum(['organization', 'employee']).optional(),
    orgSlug: z.string().optional()
  });
  try {
    const body = schema.parse(req.body);
    const result = await authService.login({ 
      identifier: body.identifier, 
      password: body.password, 
      rememberMe: body.rememberMe,
      targetRole: body.targetRole,
      orgSlug: body.orgSlug,
      ipAddress: req.ip || undefined,
      userAgent: req.headers['user-agent'] || undefined
    });
    if (result.requires2fa) {
      return res.json({ requires2fa: true, tempToken: result.tempToken });
    }
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Login failed' });
  }
};

/** Request magic link */
export const requestMagicLink = async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email() });
  try {
    const { email } = schema.parse(req.body);
    const baseUrl = req.body.baseUrl || CLIENT_URL;
    await authService.createMagicLink(email, baseUrl);
    return res.json({ message: 'Magic link sent' });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed' });
  }
};

/** Verify magic link */
export const verifyMagic = async (req: Request, res: Response) => {
  const schema = z.object({ token: z.string() });
  try {
    const { token } = schema.parse(req.query);
    const result = await authService.verifyMagicLink(String(token));
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Invalid token' });
  }
};

/** Refresh endpoint */
export const refresh = async (req: Request, res: Response) => {
  try {
    const raw = req.cookies['refreshToken'];
    if (!raw) return res.status(401).json({ message: 'No refresh token' });
    const result = await authService.refreshAccessToken(raw);
    return res.json({ accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(401).json({ message: err.message || 'Unauthorized' });
  }
};

/** Logout */
export const logout = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    
    // Auto clock out employee on explicit logout (across all active workspace identities)
    if (user && user.role === 'employee') {
      const { User } = await import('../models/User');
      const currentUser = await User.findById(user.userId).select('email').lean();
      if (currentUser && currentUser.email) {
        const allProfiles = await User.find({ email: currentUser.email.toLowerCase() }).select('_id').lean();
        const allProfileIds = allProfiles.map(p => p._id);

        const { TimeEntry } = await import('../models/TimeEntry');
        const openShifts = await TimeEntry.find({ userId: { $in: allProfileIds }, clockOut: { $exists: false } });
        if (openShifts.length > 0) {
          const now = new Date();
          for (const shift of openShifts) {
            const diffMs = now.getTime() - shift.clockIn.getTime();
            const minutes = Math.floor(diffMs / (1000 * 60));
            shift.clockOut = now;
            shift.durationMinutes = Math.max(0, minutes);
            await shift.save();
          }
        }
      }
    }

    const raw = req.cookies['refreshToken'];
    if (raw) await authService.revokeRefreshToken(raw);
    res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
    return res.json({ message: 'Logged out' });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed' });
  }
};

/** Invite member */
export const invite = async (req: Request, res: Response) => {
  const schema = z.object({ 
    name: z.string().min(1), 
    email: z.string().email(), 
    role: z.enum(['admin', 'employee']),
    department: z.string().optional() 
  });
  try {
    const body = schema.parse(req.body);
    const baseUrl = CLIENT_URL;
    const authedReq = req as Request & { user: TokenPayload };
    const user = await authService.inviteMember({ 
      orgId: authedReq.user.orgId, 
      name: body.name, 
      email: body.email, 
      role: body.role, 
      department: body.department,
      baseUrl 
    });
    return res.status(201).json({ user });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to invite' });
  }
};

/** Validate invite token GET */
export const validateInvite = async (req: Request, res: Response) => {
  const token = req.params.token;
  try {
    const result = await authService.validateInviteToken(String(token));
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Invalid invite' });
  }
};

/** Complete invite (set user details + password) */
export const completeInvite = async (req: Request, res: Response) => {
  const schema = z.object({ 
    password: z.string().min(8),
    username: z.string().min(2),
    countryCode: z.string().min(1),
    phone: z.string().min(5)
  });
  try {
    const body = schema.parse(req.body);
    const token = req.params.token;
    const result = await authService.completeInvite(
      String(token), 
      body.password, 
      body.username, 
      body.countryCode, 
      body.phone
    );
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);
    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to complete setup.' });
  }
};

/** Get current user + org info */
export const me = async (req: Request, res: Response) => {
  try {
    const authedReq = req as Request & { user: TokenPayload };
    const UserMod = (await import('../models/User')).User;
    const OrgMod = (await import('../models/Organization')).Organization;

    let user = await UserMod.findById(authedReq.user.userId);
    const org = await OrgMod.findById(authedReq.user.orgId);

    if (user && !user.avatar && user.email) {
      // AUTO-HEAL MECHANISM: Retrieve the avatar from any of their other active organization profiles!
      const peerWithAvatar = await UserMod.findOne({
        email: user.email.toLowerCase(),
        avatar: { $exists: true, $ne: '' }
      });
      
      if (peerWithAvatar && peerWithAvatar.avatar) {
        user.avatar = peerWithAvatar.avatar;
        // Direct write without triggering standard schema update validations for speed and safety
        await UserMod.updateOne({ _id: user._id }, { avatar: peerWithAvatar.avatar });
      }
    }

    return res.json({ user, org });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed' });
  }
};

/** Claim invite code for logged-in employee */
export const claimInvite = async (req: Request, res: Response) => {
  const schema = z.object({ token: z.string().min(1) });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const result = await authService.claimInvite(user.userId, body.token);
    return res.status(200).json({ 
      message: 'Workplace successfully joined!',
      org: result.org 
    });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to join organization.' });
  }
};

/** Create a persistent Join Request for an organization by Slug */
export const joinBySlug = async (req: Request, res: Response) => {
  const schema = z.object({ slug: z.string().min(1) });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const result = await authService.joinBySlug(user.userId, body.slug);
    return res.status(200).json({
      message: 'Join request sent successfully! Waiting for organization approval.',
      org: result.org
    });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to send join request.' });
  }
};

/** Get all JoinRequests filed under this active Organization */
export const getOrgJoinRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const requests = await authService.getJoinRequestsForOrg(user.orgId);
    return res.json({ requests });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Get current user request submission logs */
export const getUserJoinRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const requests = await authService.getJoinRequestsForUser(user.userId);
    return res.json({ requests });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/** Resolve active organization join request */
export const resolveJoinRequest = async (req: Request, res: Response) => {
  const schema = z.object({ requestId: z.string(), resolution: z.enum(['approved', 'rejected']) });
  try {
    const { requestId, resolution } = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const result = await authService.resolveJoinRequest(user.orgId, requestId, resolution);
    return res.json({
      message: `Request successfully ${resolution}!`,
      ...result
    });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to resolve request.' });
  }
};

/** Verify 2FA code during login */
export const verify2fa = async (req: Request, res: Response) => {
  const schema = z.object({ code: z.string().min(6) });
  try {
    const body = schema.parse(req.body);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No temporary token provided.' });
    }
    const tempToken = authHeader.split(' ')[1];
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.verify2faLogin({
      tempToken,
      code: body.code,
      ipAddress,
      userAgent
    });

    // Set refresh token cookie on successful authentication
    res.cookie('refreshToken', result.refreshRaw, COOKIE_OPTIONS);

    return res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Verification failed.' });
  }
};

/** Setup 2FA for the logged-in admin */
export const setup2fa = async (req: Request, res: Response) => {
  const schema = z.object({ deviceName: z.string().min(1) });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const result = await authService.setup2fa(user.userId, body.deviceName);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to initiate 2FA setup.' });
  }
};

/** Confirm and enable 2FA for the logged-in admin */
export const enable2fa = async (req: Request, res: Response) => {
  const schema = z.object({ code: z.string().min(6) });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.enable2fa(user.userId, body.code, ipAddress, userAgent);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to enable Two-Factor Authentication.' });
  }
};

/** Disable 2FA for the logged-in admin */
export const disable2fa = async (req: Request, res: Response) => {
  const schema = z.object({ passwordConfirm: z.string() });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.disable2fa(user.userId, body.passwordConfirm, ipAddress, userAgent);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to disable Two-Factor Authentication.' });
  }
};

/** Regenerate backup recovery codes */
export const regenerateBackupCodes = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const result = await authService.regenerateBackupCodes(user.userId, ipAddress, userAgent);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to regenerate backup codes.' });
  }
};

/** Revoke/Delete individual 2FA device */
export const delete2faDevice = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    const deviceId = String(req.params.deviceId);
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']) : undefined;

    const result = await authService.delete2faDevice(user.userId, deviceId, ipAddress, userAgent);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Failed to revoke device.' });
  }
};

/** Verify TOTP for sensitive in-app action (user already authenticated) */
export const verifyActionTotp = async (req: Request, res: Response) => {
  const schema = z.object({ code: z.string().min(6).max(10) });
  try {
    const body = schema.parse(req.body);
    const user = (req as any).user as TokenPayload;
    const result = await authService.verifyActionTotp(user.userId, body.code);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Verification failed.' });
  }
};
