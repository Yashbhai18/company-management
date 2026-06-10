import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { totpHelper } from '../server/src/utils/totp';
import { authService } from '../server/src/services/auth.service';
import { User } from '../server/src/models/User';
import { Pending2faSession } from '../server/src/models/Pending2faSession';
import { AuditLog } from '../server/src/models/AuditLog';
import { decrypt } from '../server/src/utils/crypto';

const uri = 'mongodb://ThinkX:11006618@ac-oegcwrk-shard-00-01.ytwfy5a.mongodb.net:27017/jibble_clone?ssl=true&authSource=admin&directConnection=true';

async function runTest() {
  console.log('--- STARTING 2FA INTEGRATION TEST (TS) ---');
  try {
    await mongoose.connect(uri);
    console.log('Connected to Database successfully.');

    // 1. Setup/Find Test Admin user
    let user = await User.findOne({ email: 'test-2fa-admin@jibble-clone.com' });
    if (!user) {
      // Find an organization to assign
      const org = await mongoose.model('Organization').findOne({});
      if (!org) {
        throw new Error('Please create at least one organization first.');
      }
      user = await User.create({
        orgId: org._id,
        role: 'admin',
        name: 'Test 2FA Admin',
        email: 'test-2fa-admin@jibble-clone.com',
        username: 'test2faadmin',
        passwordHash: 'SuperSecret123!',
        isActive: true,
      });
      console.log('Created test admin user.');
    } else {
      console.log('Found existing test admin user.');
      // Reset 2FA fields for test consistency
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.tempTwoFactorSecret = null;
      user.twoFactorEnabledAt = null;
      user.twoFactorBackupCodes = [];
      user.passwordHash = 'SuperSecret123!'; // Plain text will trigger pre-save hashing
      await user.save();
      
      // Let's reload password hash after save
      user = await User.findById(user._id);
      console.log('Reset test admin user 2FA state.');
    }

    const userId = user!._id.toString();

    // 2. Setup Device A
    console.log('\n2. Setup Device A ("Device A")...');
    const setupResultA = await authService.setup2fa(userId, 'Device A');
    console.log('Setup result manual key A:', setupResultA.manualKey);
    
    const dbUserAfterSetupA = await User.findById(userId);
    if (!dbUserAfterSetupA || !dbUserAfterSetupA.tempTwoFactorDevice) {
      throw new Error('tempTwoFactorDevice was not saved in database for Device A.');
    }
    const decryptedTempSecretA = decrypt(dbUserAfterSetupA.tempTwoFactorDevice.secret);
    if (decryptedTempSecretA !== setupResultA.manualKey) {
      throw new Error('Decrypted secret for Device A does not match manual key!');
    }

    const codeA = totpHelper.generate(setupResultA.manualKey);
    const enableResultA = await authService.enable2fa(userId, codeA);
    console.log('Device A registered! Backup codes count:', enableResultA.backupCodes.length);
    if (enableResultA.backupCodes.length !== 8) {
      throw new Error('Should have generated exactly 8 backup codes for the first device.');
    }
    const deviceAId = enableResultA.device.id;

    // 3. Setup Device B
    console.log('\n3. Setup Device B ("Device B")...');
    const setupResultB = await authService.setup2fa(userId, 'Device B');
    console.log('Setup result manual key B:', setupResultB.manualKey);

    const dbUserAfterSetupB = await User.findById(userId);
    if (!dbUserAfterSetupB || !dbUserAfterSetupB.tempTwoFactorDevice) {
      throw new Error('tempTwoFactorDevice was not saved in database for Device B.');
    }

    const codeB = totpHelper.generate(setupResultB.manualKey);
    const enableResultB = await authService.enable2fa(userId, codeB);
    console.log('Device B registered! Backup codes count:', enableResultB.backupCodes.length);
    if (enableResultB.backupCodes.length !== 0) {
      throw new Error('Should NOT have generated backup codes for the second device.');
    }
    const deviceBId = enableResultB.device.id;

    // 4. Verify login flow triggers 2FA check
    console.log('\n4. Verifying Password Login Flow...');
    const loginResult = await authService.login({
      identifier: 'test-2fa-admin@jibble-clone.com',
      password: 'SuperSecret123!'
    });
    if (!loginResult.requires2fa || !loginResult.tempToken) {
      throw new Error('Login should have returned requires2fa and a tempToken.');
    }

    // 5. Verify 2FA OTP code login works with Device A
    console.log('\n5a. Verifying 2FA Verification Login using Device A...');
    const currentCodeA = totpHelper.generate(setupResultA.manualKey);
    const verifyResultA = await authService.verify2faLogin({
      tempToken: loginResult.tempToken,
      code: currentCodeA
    });
    console.log('Verification login success for Device A! Access token exists:', !!verifyResultA.accessToken);

    // Verify 2FA OTP code login works with Device B
    console.log('\n5b. Verifying 2FA Verification Login using Device B...');
    const loginResultForB = await authService.login({
      identifier: 'test-2fa-admin@jibble-clone.com',
      password: 'SuperSecret123!'
    });
    const currentCodeB = totpHelper.generate(setupResultB.manualKey);
    const verifyResultB = await authService.verify2faLogin({
      tempToken: loginResultForB.tempToken!,
      code: currentCodeB
    });
    console.log('Verification login success for Device B! Access token exists:', !!verifyResultB.accessToken);

    // 6. Verify failed verification tracking & rate limiting (5 attempts limit)
    console.log('\n6. Verifying Invalidation and Attempts tracking...');
    const loginResultForLimit = await authService.login({
      identifier: 'test-2fa-admin@jibble-clone.com',
      password: 'SuperSecret123!'
    });

    const tempTokenLimit = loginResultForLimit.tempToken!;
    let failedCount = 0;
    for (let i = 1; i <= 5; i++) {
      try {
        await authService.verify2faLogin({
          tempToken: tempTokenLimit,
          code: '000000'
        });
      } catch (err: any) {
        failedCount++;
        console.log(`Failed attempt ${i} message: "${err.message}"`);
        if (i === 5) {
          if (!err.message.includes('Too many failed attempts')) {
            throw new Error('Expected 5th failed attempt to show session invalidation error.');
          }
        }
      }
    }
    console.log(`Registered ${failedCount} failures.`);
    if (failedCount !== 5) {
      throw new Error('Expected 5 verification failures.');
    }

    // Ensure session document was cleaned up
    const sessionCount = await Pending2faSession.countDocuments({ userId });
    console.log('Session count in DB after invalidation:', sessionCount);
    if (sessionCount !== 0) {
      throw new Error('Pending session should have been deleted after 5 failures.');
    }

    // 7. Verify backup codes login
    console.log('\n7. Verifying Backup Recovery Code Login...');
    const loginResultForBackup = await authService.login({
      identifier: 'test-2fa-admin@jibble-clone.com',
      password: 'SuperSecret123!'
    });

    const backupCodeToUse = enableResultA.backupCodes[0];
    console.log('Using backup code:', backupCodeToUse);
    const backupVerifyResult = await authService.verify2faLogin({
      tempToken: loginResultForBackup.tempToken!,
      code: backupCodeToUse
    });
    console.log('Backup code login success! Access token exists:', !!backupVerifyResult.accessToken);

    // 8. Revoke Device A (should keep 2FA enabled as Device B is still registered)
    console.log('\n8. Revoking Device A...');
    const deleteResultA = await authService.delete2faDevice(userId, deviceAId);
    console.log('Delete result A success:', deleteResultA.success);
    console.log('Is 2FA still active?', deleteResultA.twoFactorEnabled);
    if (!deleteResultA.twoFactorEnabled) {
      throw new Error('2FA should still be enabled since Device B is active.');
    }

    const dbUserAfterDeleteA = await User.findById(userId);
    if (!dbUserAfterDeleteA) throw new Error('User not found.');
    if (dbUserAfterDeleteA.twoFactorDevices.length !== 1 || dbUserAfterDeleteA.twoFactorDevices[0].id !== deviceBId) {
      throw new Error('Only Device B should remain registered.');
    }

    // 9. Revoke Device B (last device, should disable 2FA)
    console.log('\n9. Revoking Device B (Last device)...');
    const deleteResultB = await authService.delete2faDevice(userId, deviceBId);
    console.log('Delete result B success:', deleteResultB.success);
    console.log('Is 2FA still active?', deleteResultB.twoFactorEnabled);
    if (deleteResultB.twoFactorEnabled) {
      throw new Error('2FA should have been disabled after revoking the last device.');
    }

    const dbUserAfterDeleteB = await User.findById(userId);
    if (!dbUserAfterDeleteB) throw new Error('User not found.');
    if (dbUserAfterDeleteB.twoFactorEnabled || dbUserAfterDeleteB.twoFactorDevices.length !== 0) {
      throw new Error('2FA should be fully disabled and all devices deleted in DB.');
    }

    // 10. Verify Audit Logs generated
    console.log('\n10. Checking Audit Logs...');
    const logs = await AuditLog.find({ userId }).sort({ createdAt: -1 });
    console.log(`Found ${logs.length} audit logs for user:`);
    for (const log of logs) {
      console.log(` - Action: ${log.action} | Details: ${log.details}`);
    }
    if (logs.length < 6) {
      throw new Error('Expected at least 6 audit logs to be recorded.');
    }

    // Clean up
    await User.deleteOne({ _id: userId });
    await AuditLog.deleteMany({ userId });
    console.log('\nCleaned up test admin and logs from Database.');

    console.log('\n--- ALL TS TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);
  } catch (err) {
    console.error('\n--- TEST FAILED WITH ERROR ---');
    console.error(err);
    process.exit(1);
  }
}

runTest();
