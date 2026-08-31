import { sendColdEmail as sendColdEmailResend } from './resend';

/**
 * Re-exporting sendColdEmail via Resend for backward compatibility.
 */
export async function sendColdEmail(
  toEmail: string,
  subject: string,
  htmlContent: string,
  textContent?: string
) {
  return sendColdEmailResend(toEmail, subject, htmlContent, textContent);
}
