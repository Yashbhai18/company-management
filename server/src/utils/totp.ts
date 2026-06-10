import { OTP } from 'otplib';

const otp = new OTP({ strategy: 'totp' });

export const totpHelper = {
  /**
   * Generates a random Base32 secret key.
   */
  generateSecret: (): string => {
    return otp.generateSecret(20);
  },

  /**
   * Generates an otpauth:// URI for QR code integration.
   */
  keyuri: (email: string, issuer: string, secret: string): string => {
    return otp.generateURI({
      issuer,
      label: email,
      secret
    });
  },

  /**
   * Verifies a 6-digit TOTP token against a secret.
   * Returns true if valid, false otherwise.
   */
  verify: (token: string, secret: string): boolean => {
    try {
      const result = otp.verifySync({
        token,
        secret
      });
      return result.valid;
    } catch (err) {
      console.error('Error verifying TOTP code:', err);
      return false;
    }
  },

  /**
   * Generates the current 6-digit TOTP token for a secret.
   * Useful for testing and validation.
   */
  generate: (secret: string): string => {
    return otp.generateSync({ secret });
  }
};
