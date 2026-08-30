export async function sendColdEmail(toEmail: string, subject: string, htmlContent: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing BREVO_API_KEY environment variable');
  }

  const senderEmail = process.env.SENDER_EMAIL || 'growth@getmr2labs.com';
  const senderName = process.env.SENDER_NAME || 'Rashard';
  const bccEmail = process.env.BCC_EMAIL || 'rashardln@gmail.com';

  // 1. Send primary email to actual recipient (clean, no shared tracking tokens)
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
      htmlContent: htmlContent
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API Error: ${response.status} ${errorText}`);
  }

  // 2. Send separate test copy to BCC address with test=true appended to links
  if (bccEmail && bccEmail !== toEmail) {
    try {
      const bccHtmlContent = htmlContent
        .replace(/(\/api\/audit\/[a-zA-Z0-9_-]+)/g, '$1?test=true')
        .replace(/(\/api\/response\?id=[a-zA-Z0-9_-]+)/g, '$1&test=true');

      const bccRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: bccEmail }],
          subject: `[BCC TEST COPY → ${toEmail}] ${subject}`,
          htmlContent: bccHtmlContent
        })
      });

      if (!bccRes.ok) {
        const bccErrText = await bccRes.text();
        console.error(`[Brevo Helper] BCC test copy send failed (${bccRes.status}):`, bccErrText);
      }
    } catch (bccErr) {
      console.warn('[Brevo Helper] BCC test copy send exception:', bccErr);
    }
  }

  return response.json();
}
