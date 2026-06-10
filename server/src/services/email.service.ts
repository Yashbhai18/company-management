import { RESEND_API_KEY, EMAIL_FROM } from '../config/env';
import { Resend } from 'resend';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/** Simple email service using Resend. Falls back to console when no key configured. */
export const sendInviteEmail = async (to: string, name: string, inviteUrl: string) => {
  const subject = `You're invited to join Jibble-Clone`;
  const html = `<p>Hi ${name},</p><p>You were invited to join. Click <a href="${inviteUrl}">here</a> to accept the invite. This link expires in 24 hours.</p>`;
  if (!resend) {
    console.info('SendInvite (console fallback):', { to, subject, inviteUrl });
    return;
  }
  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });
};

export const sendMagicLinkEmail = async (to: string, name: string, link: string) => {
  const subject = `Your magic sign-in link`;
  const html = `<p>Hi ${name},</p><p>Use this magic link to sign in: <a href="${link}">Sign in</a>. Expires in 15 minutes.</p>`;
  if (!resend) {
    console.info('SendMagicLink (console fallback):', { to, subject, link });
    return;
  }
  await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
};
