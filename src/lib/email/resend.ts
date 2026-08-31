export async function sendColdEmail(
  toEmail: string,
  subject: string,
  htmlContent: string,
  textContent?: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY environment variable');

  const senderEmail = process.env.SENDER_EMAIL || 'growth@getmr2labs.com';
  const senderName = process.env.SENDER_NAME || 'Rashard';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${senderName} <${senderEmail}>`,
      to: [toEmail],
      subject: subject,
      html: htmlContent,
      ...(textContent && { text: textContent })
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API Error: ${response.status} ${errorText}`);
  }

  return response.json();
}
