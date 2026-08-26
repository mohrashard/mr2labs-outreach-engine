export async function sendColdEmail(toEmail: string, subject: string, htmlContent: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing BREVO_API_KEY environment variable');
  }

  const senderEmail = process.env.SENDER_EMAIL || 'outreach@mr2labs.com';
  const senderName = process.env.SENDER_NAME || 'MR² Labs';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: toEmail }],
      bcc: [{ email: process.env.BCC_EMAIL || 'rashardln@gmail.com' }],
      subject: subject,
      htmlContent: htmlContent
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API Error: ${response.status} ${errorText}`);
  }

  return response.json();
}
