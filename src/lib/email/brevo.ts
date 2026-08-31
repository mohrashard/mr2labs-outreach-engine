export async function sendColdEmail(
  toEmail: string,
  subject: string,
  htmlContent: string,
  textContent?: string
) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing BREVO_API_KEY environment variable');
  }

  const senderEmail = process.env.SENDER_EMAIL || 'growth@getmr2labs.com';
  const senderName = process.env.SENDER_NAME || 'Rashard';

  // Derived plain text fallback if textContent is not explicitly passed
  const derivedText = textContent || htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Send primary email with both HTML and plain text MIME formats (multipart/alternative)
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
      subject: subject,
      htmlContent: htmlContent,
      textContent: derivedText
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API Error: ${response.status} ${errorText}`);
  }

  return response.json();
}
