import { User } from '../models/User';
import { Organization } from '../models/Organization';
import { RefreshToken } from '../models/RefreshToken';
import { MagicLink } from '../models/MagicLink';
import { JoinRequest } from '../models/JoinRequest';
import { ensureCustomDepartmentSaved } from '../models/Organization';
import { generateAccessToken, TokenPayload, generateTemp2faToken } from '../utils/token';
import { generateRefreshToken, hashToken } from '../utils/hash';
import mongoose from 'mongoose';
import { addMinutes, addDays } from 'date-fns';
import { sendInviteEmail, sendMagicLinkEmail, sendWelcomeEmail, sendLoginAlertEmail } from './email.service';
import { v4 as uuidv4 } from 'uuid';
import { notificationService } from './notification.service';
import { CLIENT_URL } from '../config/env';

/** Business logic for auth operations */
export const authService = {
  /** Register new organization + super_admin */
  registerOrganization: async (params: {
    orgName: string;
    slug: string;
    name: string;
    email?: string;
    phone?: string;
    password: string;
  }) => {
    // Removed explicit global duplicate check to allow 1 email to map to multiple distinct organizations.
    // The Organization model ensures 'slug' is globally unique, effectively siloing these identities.

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const org = await Organization.create([{
        name: params.orgName,
        slug: params.slug,
        ownerId: new mongoose.Types.ObjectId(), // placeholder; will be replaced
      }], { session });

      const orgDoc = org[0];
      const generatedUsername = params.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const user = await User.create([{
        orgId: orgDoc._id,
        role: 'super_admin',
        name: params.name,
        username: generatedUsername,
        email: params.email,
        phone: params.phone,
        passwordHash: params.password,
        isActive: true,
      }], { session });

      // set ownerId to created user
      orgDoc.ownerId = user[0]._id;
      await orgDoc.save({ session });

      await session.commitTransaction();
      session.endSession();

      const payload: TokenPayload = { userId: user[0]._id.toString(), orgId: orgDoc._id.toString(), role: 'super_admin' };
      const accessToken = generateAccessToken(payload);

      const refresh = generateRefreshToken();
      const expiresAt = addDays(new Date(), 7);
      await RefreshToken.create({ userId: user[0]._id, token: refresh.hashed, expiresAt });

      if (params.email) {
        const raw = uuidv4() + '.' + cryptoRandomHex(32);
        const hashed = hashToken(raw);
        const magicExpiresAt = addDays(new Date(), 1);
        await MagicLink.create([{ userId: user[0]._id, token: hashed, expiresAt: magicExpiresAt, used: false }], { session });

        const cleanClientUrl = CLIENT_URL.endsWith('/') ? CLIENT_URL.slice(0, -1) : CLIENT_URL;
        const verificationLink = `${cleanClientUrl}/login/verify?token=${raw}`;
        sendWelcomeEmail(params.email, params.name, verificationLink).catch((e) => console.error('Failed to send welcome email:', e));
      }

      return { user: user[0], org: orgDoc, accessToken, refreshRaw: refresh.raw };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  },

  /** Expand new org under EXISTING logged-in user credentials without requiring password reentry */
  expandOrganization: async (currentUserId: string, params: { orgName: string; slug: string }) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) throw new Error('User not found');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const org = await Organization.create([{
        name: params.orgName,
        slug: params.slug,
        ownerId: new mongoose.Types.ObjectId(),
      }], { session });

      const orgDoc = org[0];
      
      // Directly reuse current credentials including passwordHash!
      const user = await User.create([{
        orgId: orgDoc._id,
        role: 'super_admin',
        name: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone,
        passwordHash: currentUser.passwordHash, // IMPORTANT: Mongoose schema pre-save checks ifModified('passwordHash'). Since this is an insert of an ALREADY hashed string directly, make sure not to re-hash! Actually wait, model pre-save checks `isModified`. It is modified on insert.
        // Wait! If I copy the hash, the model's pre-save hook WILL RE-HASH THE HASH! 
        // I must insert WITHOUT trigger or pass plaintext?
        // Actually, User model's pre-save only hashes if it sees `this.passwordHash`.
        // Wait! I can provide `passwordHash` as already hashed, but the pre-save uses `bcrypt.hash`.
        // To avoid double hashing, I should fetch current hash and insert it directly via update or disable hook temporarily.
        // Actually, I'll just store it in temporary string and reset it after creation via direct db write!
        isActive: true,
      }], { session });

      orgDoc.ownerId = user[0]._id;
      await orgDoc.save({ session });
      
      // Manually set the password hash directly so pre-save double hashing is bypassed
      await User.updateOne({ _id: user[0]._id }, { passwordHash: currentUser.passwordHash }).session(session);

      await session.commitTransaction();
      session.endSession();

      const payload: TokenPayload = { userId: user[0]._id.toString(), orgId: orgDoc._id.toString(), role: 'super_admin' };
      const accessToken = generateAccessToken(payload);
      const refresh = generateRefreshToken();
      await RefreshToken.create({ userId: user[0]._id, token: refresh.hashed, expiresAt: addDays(new Date(), 7) });

      return { user: user[0], org: orgDoc, accessToken, refreshRaw: refresh.raw };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  },

  /** Direct signup for self-registering employee into existing org */
  registerEmployee: async (params: {
    slug: string;
    name: string;
    email?: string;
    phone?: string;
    password: string;
  }) => {
    if (params.email) {
      const existing = await User.findOne({ email: params.email.toLowerCase() });
      if (existing) {
        throw new Error('This email address is already registered. Please log in or use a different email.');
      }
    }

    // Case-insensitive lookup for organization slug
    const org = await Organization.findOne({ slug: { $regex: new RegExp(`^${params.slug}$`, 'i') } });
    if (!org) throw new Error('Organization not found. Please check your slug.');

    const generatedUsername = params.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const user = await User.create({
      orgId: org._id,
      role: 'employee',
      name: params.name,
      username: generatedUsername,
      email: params.email,
      phone: params.phone,
      passwordHash: params.password,
      isActive: true,
    });

    const payload: TokenPayload = { userId: user._id.toString(), orgId: org._id.toString(), role: 'employee' };
    const accessToken = generateAccessToken(payload);
    const refresh = generateRefreshToken();
    const expiresAt = addDays(new Date(), 7);
    await RefreshToken.create({ userId: user._id, token: refresh.hashed, expiresAt });

    if (params.email) {
      const raw = uuidv4() + '.' + cryptoRandomHex(32);
      const hashed = hashToken(raw);
      const magicExpiresAt = addDays(new Date(), 1);
      await MagicLink.create({ userId: user._id, token: hashed, expiresAt: magicExpiresAt, used: false });

      const cleanClientUrl = CLIENT_URL.endsWith('/') ? CLIENT_URL.slice(0, -1) : CLIENT_URL;
      const verificationLink = `${cleanClientUrl}/login/verify?token=${raw}`;
      sendWelcomeEmail(params.email, params.name, verificationLink).catch((e) => console.error('Failed to send welcome email:', e));
    }

    return { user, accessToken, refreshRaw: refresh.raw };
  },

  /** Fetch all distinct org memberships for current user identity email */
  getMyOrganizations: async (currentUserId: string) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.email) return [];
    
    // Find all organization memberships sharing the identical email across ALL roles!
    const memberships = await User.find({ 
      email: currentUser.email.toLowerCase()
    }).populate('orgId');

    // Filter out any anomalies and return clean map
    return memberships
      .filter(m => m.orgId)
      .map((m: any) => ({
        orgId: m.orgId._id,
        name: m.orgId.name,
        slug: m.orgId.slug
      }));
  },

  /** Claim an inactive invite record using the current session credentials safely */
  claimInvite: async (currentUserId: string, inviteToken: string) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) throw new Error('Current session identity not found');

    const invitedUser = await User.findOne({ inviteToken });
    if (!invitedUser) throw new Error('Invitation token is invalid or has already been claimed.');
    if (!invitedUser.inviteExpiry || invitedUser.inviteExpiry < new Date()) {
      throw new Error('This invitation link has expired.');
    }

    // Strong access control: The email tied to the token MUST match the logged-in session
    if (invitedUser.email?.toLowerCase() !== currentUser.email?.toLowerCase()) {
      throw new Error('Access Denied: This invitation is registered to a different email address.');
    }

    // Check if they are already active under this organization record to avoid duplicate syncs
    if (invitedUser.isActive) {
      throw new Error('You are already an active member of this organization.');
    }

    // Anchor the record! Propagate credentials from current profile
    invitedUser.isActive = true;
    invitedUser.inviteToken = null;
    invitedUser.inviteExpiry = null;
    
    await invitedUser.save();
    
    // Safely direct-write password hash to skip mongoose pre-save double-hashing logic
    await User.updateOne({ _id: invitedUser._id }, { passwordHash: currentUser.passwordHash });

    const org = await Organization.findById(invitedUser.orgId);
    return { user: invitedUser, org };
  },

  /** Direct request submission to join an existing organization via public Slug */
  joinBySlug: async (currentUserId: string, slug: string) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) throw new Error('Identity token expired or invalid.');

    // Case-insensitive lookup for organization slug
    const org = await Organization.findOne({ slug: { $regex: new RegExp(`^${slug.trim()}$`, 'i') } });
    if (!org) throw new Error('Organization not found. Please verify the Slug ID.');

    // Check if user is already an active member
    const existingMember = await User.findOne({
      orgId: org._id,
      email: currentUser.email?.toLowerCase()
    });
    if (existingMember) {
      throw new Error('You are already an active member of this organization.');
    }

    // Check if an existing PENDING request already exists to prevent spamming
    const pendingRequest = await JoinRequest.findOne({
      orgId: org._id,
      email: currentUser.email?.toLowerCase(),
      status: 'pending'
    });
    if (pendingRequest) {
      throw new Error('A pending request to join this organization is already in progress.');
    }

    // Create structured join request record tracking history
    const request = await JoinRequest.create({
      orgId: org._id,
      userId: currentUser._id,
      name: currentUser.name,
      email: currentUser.email?.toLowerCase(),
      status: 'pending'
    });

    // Async notification to org admins
    try {
      await notificationService.notifyAdmins(org._id, {
        type: 'join_request',
        title: 'New Join Request',
        message: `${currentUser.name} requested to join your workspace.`,
        actionUrl: '/people'
      });
    } catch (notifErr) {
      console.error('Failed to dispatch join request notification:', notifErr);
    }

    return { request, org };
  },

  /** Retrieve all JoinRequest entries associated with an Organization */
  getJoinRequestsForOrg: async (orgId: string) => {
    return JoinRequest.find({ orgId })
      .populate('userId', 'avatar')
      .sort({ createdAt: -1 });
  },

  /** Retrieve all affiliation JoinRequest history for the current user identity */
  getJoinRequestsForUser: async (currentUserId: string) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.email) return [];

    return JoinRequest.find({ email: currentUser.email.toLowerCase() })
      .populate('orgId', 'name slug')
      .sort({ createdAt: -1 });
  },

  /** Administratively review and resolve an active JoinRequest */
  resolveJoinRequest: async (orgId: string, requestId: string, resolution: 'approved' | 'rejected') => {
    const request = await JoinRequest.findOne({ _id: requestId, orgId });
    if (!request) throw new Error('Join request not found.');
    if (request.status !== 'pending') throw new Error('This request has already been processed.');

    if (resolution === 'rejected') {
      request.status = 'rejected';
      await request.save();

      // Async notification to user
      try {
        const org = await Organization.findById(orgId);
        const baseUser = await User.findById(request.userId);
        if (baseUser) {
          await notificationService.createNotification({
            userId: baseUser._id,
            orgId: baseUser.orgId,
            type: 'join_request_status',
            title: 'Join Request Rejected',
            message: `Your request to join ${org?.name || 'organization'} was rejected.`,
            actionUrl: '/dashboard'
          });
        }
      } catch (notifErr) {
        console.error('Failed to dispatch join rejection notification:', notifErr);
      }

      return { status: 'rejected' };
    }

    // RESOLUTION: APPROVED
    // Ensure the profile wasn't already provisioned through separate action
    const existingUser = await User.findOne({ orgId: request.orgId, email: request.email });
    if (existingUser) {
      request.status = 'approved';
      await request.save();
      throw new Error('User is already an active member of this organization.');
    }

    // Fetch the full base user document to replicate existing credentials accurately
    const baseUser = await User.findById(request.userId);
    if (!baseUser) throw new Error('Original user account no longer exists.');

    const generatedUsername = baseUser.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Replicate account identity details instantly!
    const newUser = await User.create({
      orgId: request.orgId,
      role: 'employee',
      name: baseUser.name,
      username: generatedUsername,
      email: baseUser.email,
      phone: baseUser.phone,
      passwordHash: baseUser.passwordHash,
      avatar: baseUser.avatar,
      isActive: true
    });

    // Skip schema hash collision directly
    await User.updateOne({ _id: newUser._id }, { passwordHash: baseUser.passwordHash });

    // Conclude transaction
    request.status = 'approved';
    await request.save();

    // Async notification to user in original workspace
    try {
      const org = await Organization.findById(orgId);
      const baseUser = await User.findById(request.userId);
      if (baseUser) {
        await notificationService.createNotification({
          userId: baseUser._id,
          orgId: baseUser.orgId,
          type: 'join_request_status',
          title: 'Join Request Approved',
          message: `Your request to join ${org?.name || 'organization'} was approved!`,
          actionUrl: '/dashboard'
        });
      }
    } catch (notifErr) {
      console.error('Failed to dispatch join approval notification:', notifErr);
    }

    return { status: 'approved', user: newUser };
  },

  /** Reissue access tokens instantly swap into parallel context safely */
  switchOrganization: async (currentUserId: string, targetOrgId: string) => {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser || !currentUser.email) throw new Error('Identity undefined');

    // Crucial validation: Ensure user actually HAS a valid, identical record registered under THAT specific Org!
    const targetUser = await User.findOne({ 
      orgId: targetOrgId, 
      email: currentUser.email.toLowerCase() 
    });
    
    if (!targetUser) throw new Error('Unauthorized attempt to switch context.');

    // Issue fresh identity tokens instantly
    const payload: TokenPayload = { 
      userId: targetUser._id.toString(), 
      orgId: targetUser.orgId.toString(), 
      role: targetUser.role 
    };
    
    const accessToken = generateAccessToken(payload);
    const refresh = generateRefreshToken();
    await RefreshToken.create({ userId: targetUser._id, token: refresh.hashed, expiresAt: addDays(new Date(), 7) });

    targetUser.lastLogin = new Date();
    await targetUser.save();

    return { user: targetUser, accessToken, refreshRaw: refresh.raw };
  },

  /** Login with email/phone + password */
  login: async (params: { 
    identifier: string; 
    password: string; 
    rememberMe?: boolean; 
    targetRole?: 'organization' | 'employee';
    orgSlug?: string; // NEW parameter enabling multi-org isolation!
    ipAddress?: string;
    userAgent?: string;
  }) => {
    let query: any = { 
      $or: [
        { email: params.identifier.toLowerCase() }, 
        { username: params.identifier.toLowerCase() },
        { phone: params.identifier }
      ] 
    };

    // Isolate tenant lookup to selected role boundaries
    if (params.targetRole) {
      if (params.targetRole === 'employee') {
        query.role = 'employee';
      } else if (params.targetRole === 'organization') {
        query.role = { $in: ['admin', 'super_admin'] };
      }
    }

    // If an organization slug was provided, pre-resolve that org ID using case-insensitive lookup
    if (params.orgSlug) {
      const targetOrg = await Organization.findOne({ slug: { $regex: new RegExp(`^${params.orgSlug}$`, 'i') } });
      if (!targetOrg) throw new Error('Organization not found with that ID.');
      query.orgId = targetOrg._id;
    }

    // Find matching user. Note: if no slug provided, returns first global match
    const user = await User.findOne(query);
    if (!user) throw new Error('Invalid credentials');

    if (params.targetRole) {
      const isWorker = user.role === 'employee';
      if (params.targetRole === 'employee' && !isWorker) {
        throw new Error('This account belongs to an Organization. Please select Organization to sign in.');
      }
      if (params.targetRole === 'organization' && isWorker) {
        throw new Error('This account belongs to an Employee. Please select Employee to sign in.');
      }
    }

    const ok = await user.comparePassword!(params.password);
    if (!ok) throw new Error('Invalid credentials');

        if (user.twoFactorEnabled && (user.role === 'admin' || user.role === 'super_admin')) {
      const { Pending2faSession } = await import('../models/Pending2faSession');
      
      // Expire temp session in 5 minutes
      const expiresAt = addMinutes(new Date(), 5);
      const session = await Pending2faSession.create({
        userId: user._id,
        attempts: 0,
        expiresAt
      });

      const tempToken = generateTemp2faToken({
        userId: user._id.toString(),
        pendingSessionId: session._id.toString(),
        isTemp2fa: true
      });

      user.rememberMe = !!params.rememberMe;
      await user.save();

      return { requires2fa: true, tempToken };
    }

    const payload: TokenPayload = { userId: user._id.toString(), orgId: user.orgId.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refresh = generateRefreshToken();
    const expiresAt = params.rememberMe ? addDays(new Date(), 30) : addDays(new Date(), 7);

    await RefreshToken.create({ userId: user._id, token: refresh.hashed, expiresAt });
    user.lastLogin = new Date();
    await user.save();

    if (user.email) {
      sendLoginAlertEmail(user.email, user.name, params.ipAddress, params.userAgent).catch((e) => console.error('Failed to send login alert email:', e));
    }

    return { user, accessToken, refreshRaw: refresh.raw };
  },

  /** Create magic link and send email */
  createMagicLink: async (email: string, baseUrl: string) => {
    const user = await User.findOne({ email });
    if (!user) throw new Error('No user found');
    const raw = uuidv4() + '.' + cryptoRandomHex(32);
    const hashed = hashToken(raw);
    const expiresAt = addMinutes(new Date(), 15);
    await MagicLink.create({ userId: user._id, token: hashed, expiresAt, used: false });
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const link = `${cleanBaseUrl}/login/verify?token=${raw}`;
    await sendMagicLinkEmail(user.email!, user.name, link);
  },

  /** Verify magic link raw token; set used and return access + refresh tokens */
  verifyMagicLink: async (rawToken: string) => {
    const hashed = hashToken(rawToken);
    const doc = await MagicLink.findOne({ token: hashed });
    if (!doc) throw new Error('Invalid or expired token');
    if (doc.used) throw new Error('Token already used');
    if (doc.expiresAt < new Date()) throw new Error('Token expired');

    // mark used immediately
    doc.used = true;
    await doc.save();

    const user = await User.findById(doc.userId);
    if (!user) throw new Error('User not found');

    const payload: TokenPayload = { userId: user._id.toString(), orgId: user.orgId.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refresh = generateRefreshToken();
    const expiresAt = addDays(new Date(), 7);
    await RefreshToken.create({ userId: user._id, token: refresh.hashed, expiresAt });

    return { user, accessToken, refreshRaw: refresh.raw };
  },

  /** Swap refresh token raw for new access token */
  refreshAccessToken: async (rawToken: string) => {
    const hashed = hashToken(rawToken);
    const doc = await RefreshToken.findOne({ token: hashed });
    if (!doc) throw new Error('Invalid refresh token');
    if (doc.expiresAt < new Date()) {
      await doc.deleteOne();
      throw new Error('Refresh token expired');
    }
    const user = await User.findById(doc.userId);
    if (!user) throw new Error('User not found');
    const payload: TokenPayload = { userId: user._id.toString(), orgId: user.orgId.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    return { accessToken };
  },

  /** Logout: revoke refresh token by raw value hash */
  revokeRefreshToken: async (rawToken: string) => {
    const hashed = hashToken(rawToken);
    await RefreshToken.deleteMany({ token: hashed });
  },

  /** Invite member: create inactive user with inviteToken and send email */
  inviteMember: async (params: { orgId: string; name: string; email: string; role: 'admin' | 'employee'; department?: string; baseUrl: string }) => {
    if (params.role === 'employee' && (!params.department || !params.department.trim())) {
      throw new Error('Department is mandatory for employees.');
    }

    // Register customized novel departments in the persistent organization ledger
    if (params.department) {
      await ensureCustomDepartmentSaved(params.orgId, params.department);
    }

    const inviteRaw = uuidv4();
    const expiry = addDays(new Date(), 1);
    const generatedUsername = params.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const user = await User.create({ 
      orgId: params.orgId, 
      role: params.role, 
      name: params.name, 
      username: generatedUsername, 
      email: params.email, 
      department: params.department,
      isActive: false, 
      inviteToken: inviteRaw, 
      inviteExpiry: expiry 
    });
    const inviteUrl = `${params.baseUrl}/invite/${inviteRaw}`;
    await sendInviteEmail(params.email, params.name, inviteUrl);
    return user;
  },

  /** Validate invite token */
  validateInviteToken: async (rawToken: string) => {
    const user = await User.findOne({ inviteToken: rawToken });
    if (!user) throw new Error('Invalid invite token');
    if (!user.inviteExpiry || user.inviteExpiry < new Date()) throw new Error('Invite expired');
    return { name: user.name, email: user.email, orgId: user.orgId };
  },

  /** Complete invite: set profile identities, set password, activate user, clear token, return tokens */
  completeInvite: async (rawToken: string, password: string, username: string, countryCode: string, phone: string) => {
    const user = await User.findOne({ inviteToken: rawToken });
    if (!user) throw new Error('Invalid invite token');
    if (!user.inviteExpiry || user.inviteExpiry < new Date()) throw new Error('Invite expired');
    
    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 2) {
      throw new Error('Username must be at least 2 alphanumeric characters.');
    }

    // Enforce org-level username uniqueness on acceptance!
    const duplicate = await User.findOne({ 
      orgId: user.orgId, 
      username: cleanUsername, 
      _id: { $ne: user._id } 
    });
    if (duplicate) {
      throw new Error('This username is already claimed by another team member.');
    }

    user.username = cleanUsername;
    user.countryCode = countryCode;
    user.phone = phone.trim();
    user.passwordHash = password;
    user.isActive = true;
    user.inviteToken = null;
    user.inviteExpiry = null;
    await user.save();

    const payload: TokenPayload = { userId: user._id.toString(), orgId: user.orgId.toString(), role: user.role };
    const accessToken = generateAccessToken(payload);
    const refresh = generateRefreshToken();
    const expiresAt = addDays(new Date(), 7);
    await RefreshToken.create({ userId: user._id, token: refresh.hashed, expiresAt });
    return { user, accessToken, refreshRaw: refresh.raw };
  },

  /** Start 2FA setup flow */
  setup2fa: async (userId: string, deviceName: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      throw new Error('Only administrators can enable Two-Factor Authentication.');
    }
    const cleanName = deviceName.trim();
    if (!cleanName) {
      throw new Error('Device name is required.');
    }

    const { totpHelper } = await import('../utils/totp');
    const qrcode = await import('qrcode');
    const { encrypt } = await import('../utils/crypto');

    const secret = totpHelper.generateSecret();
    const serviceName = 'AttendanceTracker';
    const email = user.email || user.username || 'admin';
    const otpauthUrl = totpHelper.keyuri(email, serviceName, secret);
    
    // Generate QR code data URI
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    // Save encrypted pending device setup
    user.tempTwoFactorDevice = {
      deviceName: cleanName,
      secret: encrypt(secret)
    };
    await user.save();

    return { qrCodeUrl, manualKey: secret };
  },

  /** Confirm 2FA setup and activate it */
  enable2fa: async (userId: string, code: string, ipAddress?: string, userAgent?: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      throw new Error('Only administrators can enable Two-Factor Authentication.');
    }
    if (!user.tempTwoFactorDevice) {
      throw new Error('2FA setup has not been initiated. Please run setup first.');
    }

    const { totpHelper } = await import('../utils/totp');
    const { decrypt } = await import('../utils/crypto');
    const { auditService } = await import('./audit.service');
    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');

    const secret = decrypt(user.tempTwoFactorDevice.secret);
    const isValid = totpHelper.verify(code, secret);
    if (!isValid) {
      await auditService.log({
        userId,
        action: '2fa_setup_failed_verification',
        details: `Incorrect OTP code entered during 2FA setup activation for device: ${user.tempTwoFactorDevice.deviceName}`,
        ipAddress,
        userAgent
      });
      throw new Error('Invalid verification code. Please try again.');
    }

    const isFirstDevice = user.twoFactorDevices.length === 0;
    let rawBackupCodes: string[] = [];

    if (isFirstDevice) {
      // Generate 8 backup recovery codes
      rawBackupCodes = Array.from({ length: 8 }, () => {
        return Math.random().toString(36).substring(2, 7) + Math.random().toString(36).substring(2, 7);
      });

      const saltRounds = 12;
      const hashedBackupCodes = await Promise.all(
        rawBackupCodes.map(c => bcrypt.hash(c, saltRounds))
      );
      user.twoFactorBackupCodes = hashedBackupCodes;
    }

    // Add device to user list
    const newDevice = {
      id: uuidv4(),
      deviceName: user.tempTwoFactorDevice.deviceName,
      secret: user.tempTwoFactorDevice.secret,
      createdAt: new Date()
    };

    user.twoFactorDevices.push(newDevice);
    user.tempTwoFactorDevice = null;
    user.twoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date();

    await user.save();

    await auditService.log({
      userId,
      action: '2fa_enable',
      details: `Two-Factor Authentication device added: ${newDevice.deviceName}`,
      ipAddress,
      userAgent
    });

    return { backupCodes: rawBackupCodes, device: { id: newDevice.id, deviceName: newDevice.deviceName } };
  },

  /** Disable 2FA */
  disable2fa: async (userId: string, passwordConfirm: string, ipAddress?: string, userAgent?: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.twoFactorEnabled) {
      throw new Error('Two-Factor Authentication is already disabled.');
    }

    const isMatch = await user.comparePassword!(passwordConfirm);
    if (!isMatch) {
      const { auditService } = await import('./audit.service');
      await auditService.log({
        userId,
        action: '2fa_disable_failed',
        details: 'Failed attempt to disable 2FA due to incorrect password confirmation',
        ipAddress,
        userAgent
      });
      throw new Error('Incorrect password confirmation.');
    }

    const { auditService } = await import('./audit.service');

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.tempTwoFactorSecret = null;
    user.tempTwoFactorDevice = null;
    user.twoFactorEnabledAt = null;
    user.twoFactorBackupCodes = [];
    user.twoFactorDevices = [];

    await user.save();

    await auditService.log({
      userId,
      action: '2fa_disable',
      details: 'Two-Factor Authentication disabled (all devices revoked)',
      ipAddress,
      userAgent
    });

    return { success: true };
  },

  /** Delete individual 2FA device */
  delete2faDevice: async (userId: string, deviceId: string, ipAddress?: string, userAgent?: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const deviceIdx = user.twoFactorDevices.findIndex(d => d.id === deviceId);
    if (deviceIdx === -1) {
      throw new Error('Device not found.');
    }

    const deviceName = user.twoFactorDevices[deviceIdx].deviceName;
    user.twoFactorDevices.splice(deviceIdx, 1);

    const { auditService } = await import('./audit.service');

    // If no devices left, disable 2FA
    if (user.twoFactorDevices.length === 0) {
      user.twoFactorEnabled = false;
      user.twoFactorEnabledAt = null;
      user.twoFactorBackupCodes = [];
      await auditService.log({
        userId,
        action: '2fa_disable',
        details: `Two-Factor Authentication disabled due to revoking the last device: ${deviceName}`,
        ipAddress,
        userAgent
      });
    } else {
      await auditService.log({
        userId,
        action: '2fa_device_deleted',
        details: `Two-Factor Authentication device revoked: ${deviceName}`,
        ipAddress,
        userAgent
      });
    }

    await user.save();
    return { success: true, twoFactorEnabled: user.twoFactorEnabled };
  },

  /** Regenerate backup recovery codes */
  regenerateBackupCodes: async (userId: string, ipAddress?: string, userAgent?: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.twoFactorEnabled) {
      throw new Error('Please enable Two-Factor Authentication first.');
    }

    const bcrypt = await import('bcryptjs');
    const { auditService } = await import('./audit.service');

    const rawBackupCodes = Array.from({ length: 8 }, () => {
      return Math.random().toString(36).substring(2, 7) + Math.random().toString(36).substring(2, 7);
    });

    const saltRounds = 12;
    const hashedBackupCodes = await Promise.all(
      rawBackupCodes.map(c => bcrypt.hash(c, saltRounds))
    );

    user.twoFactorBackupCodes = hashedBackupCodes;
    await user.save();

    await auditService.log({
      userId,
      action: '2fa_backup_codes_regenerated',
      details: 'Regenerated new set of backup recovery codes',
      ipAddress,
      userAgent
    });

    return { backupCodes: rawBackupCodes };
  },

  /** Verifies 2FA token on login */
  verify2faLogin: async (params: {
    tempToken: string;
    code: string;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    const { verifyTemp2faToken, generateAccessToken } = await import('../utils/token');
    const { Pending2faSession } = await import('../models/Pending2faSession');
    const { decrypt } = await import('../utils/crypto');
    const { auditService } = await import('./audit.service');
    const { totpHelper } = await import('../utils/totp');
    const bcrypt = await import('bcryptjs');

    let payload;
    try {
      payload = verifyTemp2faToken(params.tempToken);
    } catch (err) {
      throw new Error('Temporary login session expired or invalid. Please login again.');
    }

    const session = await Pending2faSession.findById(payload.pendingSessionId);
    if (!session) {
      throw new Error('Temporary login session expired or invalid. Please login again.');
    }

    const user = await User.findById(payload.userId);
    if (!user || !user.twoFactorEnabled || user.twoFactorDevices.length === 0) {
      throw new Error('Two-Factor Authentication is not enabled for this account.');
    }

    // Attempt verification
    const codeClean = params.code.trim();
    let isCodeValid = false;
    let isBackupCode = false;
    let verifiedDeviceName = '';

    // Check if it's a backup code (typically 10 characters long)
    if (codeClean.length === 10) {
      for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
        const hashedCode = user.twoFactorBackupCodes[i];
        const match = await bcrypt.compare(codeClean, hashedCode);
        if (match) {
          isCodeValid = true;
          isBackupCode = true;
          // Remove the used backup code
          user.twoFactorBackupCodes.splice(i, 1);
          await user.save();
          break;
        }
      }
    } else {
      // Loop over registered devices and verify
      for (const device of user.twoFactorDevices) {
        const secret = decrypt(device.secret);
        if (totpHelper.verify(codeClean, secret)) {
          isCodeValid = true;
          verifiedDeviceName = device.deviceName;
          break;
        }
      }
    }

    if (!isCodeValid) {
      // Increment attempt counter
      session.attempts += 1;
      await session.save();

      await auditService.log({
        userId: user._id,
        action: '2fa_failed_verification',
        details: `Failed 2FA code verification attempt (${session.attempts}/5)`,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });

      if (session.attempts >= 5) {
        await session.deleteOne();
        throw new Error('Too many failed attempts. Temporary session has been invalidated. Please log in again.');
      }

      const attemptsRemaining = 5 - session.attempts;
      throw new Error(`Invalid code. ${attemptsRemaining} attempts remaining before session is invalidated.`);
    }

    // Success! Complete login
    await session.deleteOne();

    const tokenPayload = {
      userId: user._id.toString(),
      orgId: user.orgId.toString(),
      role: user.role
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refresh = generateRefreshToken();
    const expiresAt = user.rememberMe ? addDays(new Date(), 30) : addDays(new Date(), 7);
    await RefreshToken.create({ userId: user._id, token: refresh.hashed, expiresAt });

    user.lastLogin = new Date();
    await user.save();

    await auditService.log({
      userId: user._id,
      action: '2fa_login_success',
      details: isBackupCode ? 'Successful 2FA login using backup recovery code' : `Successful 2FA login using device: ${verifiedDeviceName}`,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    if (user.email) {
      sendLoginAlertEmail(user.email, user.name, params.ipAddress, params.userAgent).catch((e) => console.error('Failed to send login alert email:', e));
    }

    return { user, accessToken, refreshRaw: refresh.raw };
  },

  /** Verify TOTP for a sensitive action (user is already authenticated) */
  verifyActionTotp: async (userId: string, code: string) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');
    if (!user.twoFactorEnabled || user.twoFactorDevices.length === 0) {
      throw new Error('Two-Factor Authentication is not enabled on your account.');
    }

    const { totpHelper } = await import('../utils/totp');
    const { decrypt } = await import('../utils/crypto');

    const codeClean = code.trim();
    let isValid = false;

    for (const device of user.twoFactorDevices) {
      const secret = decrypt(device.secret);
      if (totpHelper.verify(codeClean, secret)) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      throw new Error('Invalid authenticator code. Please check your app and try again.');
    }

    return { verified: true };
  },
};

function cryptoRandomHex(len: number) {
  return Array.from(cryptoRandomBytes(len)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cryptoRandomBytes(n: number): Uint8Array {
  return require('crypto').randomBytes(n);
}
