import { BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME } from '../config/env';
import axios from 'axios';

/**
 * Generic helper to send transactional emails via Brevo SMTP REST API.
 * Falls back to printing to console if BREVO_API_KEY is not configured or set to placeholder.
 */
export const sendEmailViaBrevo = async (toEmail: string, toName: string, subject: string, htmlContent: string) => {
  if (!BREVO_API_KEY || BREVO_API_KEY === 'your_brevo_api_key_here') {
    console.info(`[Brevo Email Fallback]\nTo: ${toName} <${toEmail}>\nSubject: ${subject}\nContent:\n${htmlContent}\n`);
    return;
  }

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: EMAIL_FROM_NAME,
          email: EMAIL_FROM
        },
        to: [
          {
            email: toEmail,
            name: toName
          }
        ],
        subject,
        htmlContent
      },
      {
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    console.info(`Brevo Email Sent successfully to ${toEmail}. Message ID:`, response.data.messageId);
  } catch (error: any) {
    console.error(`Failed to send email via Brevo to ${toEmail}:`, error.response?.data || error.message);
    throw error;
  }
};

/** Send invite link to join workspace */
export const sendInviteEmail = async (to: string, name: string, inviteUrl: string) => {
  const subject = `You're invited to join edihub`;
  const html = `<p>Hi ${name},</p><p>You were invited to join our workspace. Click <a href="${inviteUrl}">here</a> to accept the invite. This link expires in 24 hours.</p>`;
  await sendEmailViaBrevo(to, name, subject, html);
};

/** Send magic link for authentication */
export const sendMagicLinkEmail = async (to: string, name: string, link: string) => {
  const subject = `Your magic sign-in link`;
  const html = `<p>Hi ${name},</p><p>Use this magic link to sign in: <a href="${link}">Sign in</a>. Expires in 15 minutes.</p>`;
  await sendEmailViaBrevo(to, name, subject, html);
};

/** Send welcome email on new registrations */
export const sendWelcomeEmail = async (to: string, name: string, verificationLink?: string) => {
  const subject = `Welcome to edihub!`;
  let html = `<p>Hi ${name},</p><p>Thank you for registering with edihub! We are excited to have you on board.</p>`;
  if (verificationLink) {
    html += `
<p>To confirm your email address and activate your account, please click the button below:</p>
<p style="margin: 24px 0;">
  <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; color: #ffffff; background-color: #4f46e5; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Verify Email Address</a>
</p>
<p style="color: #6b7280; font-size: 12px;">
  If the button doesn't work, copy and paste this link into your browser: <br/>
  <a href="${verificationLink}" style="color: #4f46e5;">${verificationLink}</a>
</p>
`;
  }
  await sendEmailViaBrevo(to, name, subject, html);
};

/** Send alert email when user logs in */
export const sendLoginAlertEmail = async (to: string, name: string, ipAddress?: string, userAgent?: string) => {
  const subject = `New Login Alert - edihub`;
  const time = new Date().toLocaleString();
  const html = `<p>Hi ${name},</p>
<p>We detected a new login to your edihub account.</p>
<ul>
  <li><strong>Time:</strong> ${time}</li>
  <li><strong>IP Address:</strong> ${ipAddress || 'Unknown'}</li>
  <li><strong>User Agent:</strong> ${userAgent || 'Unknown'}</li>
</ul>
<p>If this was not you, please secure your account immediately.</p>`;
  await sendEmailViaBrevo(to, name, subject, html);
};

/** Send forgot password OTP verification email */
export const sendForgotPasswordOtpEmail = async (to: string, name: string, otp: string) => {
  const subject = `Your password reset verification code`;
  const html = `<p>Hi ${name},</p>
<p>You requested a password reset. Your verification code is: <strong style="font-size: 18px; letter-spacing: 2px; color: #4f46e5;">${otp}</strong></p>
<p>This code is valid for 10 minutes. If you did not request this, you can ignore this email.</p>`;
  await sendEmailViaBrevo(to, name, subject, html);
};

