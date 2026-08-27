import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configure Supabase client (Server-side only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Brevo API Key
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

// Secret token to prevent unauthorized execution (e.g. from QStash)
const CRON_SECRET = process.env.CRON_SECRET || 'dev-secret';

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'growth@getmr2labs.com';
const SENDER_NAME = process.env.SENDER_NAME || 'Rashard';

export async function POST(request: Request) {
  try {
    // 1. Verify Authentication
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}` && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch one lead ready for dispatch
    // We look for QUEUED leads where the scheduled time has passed (or is null for immediate send)
    const { data: leads, error: fetchError } = await supabase
      .from('outreach_leads')
      .select(`
        *,
        campaigns ( name, niche )
      `)
      .in('status', ['NEW', 'QUEUED'])
      .or(`scheduled_for.lte.${new Date().toISOString()},scheduled_for.is.null`)
      .limit(1);

    if (fetchError) {
      throw new Error(`Failed to fetch leads: ${fetchError.message}`);
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'No leads ready for dispatch.' });
    }

    const lead = leads[0];
    const { 
      id, 
      email, 
      company_name, 
      website_url, 
      raw_scraped_data, 
      pitch_text,
      email_subject 
    } = lead;

    if (!email) {
      // Mark as missing email to prevent endless retries
      await supabase.from('outreach_leads').update({ status: 'MISSING_EMAIL' }).eq('id', id);
      return NextResponse.json({ message: `Lead ${id} missing email, skipped.` });
    }

    if (!pitch_text) {
      return NextResponse.json({ message: `Lead ${id} missing pitch text, skipped.` });
    }

    console.log(`[DISPATCH] Processing lead: ${company_name} (${email})`);

    // Extract raw domain from URL for the PDF
    let cleanDomain = website_url;
    try {
      const urlObj = new URL(website_url.startsWith('http') ? website_url : `https://${website_url}`);
      cleanDomain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      console.warn(`Could not parse URL ${website_url}`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.mr2labs.com';

    // 5. Construct Brevo Email Payload
    // Wrap the plain text pitch in a clean HTML structure
    const htmlContent = `
      <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
        ${pitch_text.split('\n').map((line: string) => `<p>${line}</p>`).join('')}
        
        <div style="margin: 30px 0;">
          <a href="${appUrl}/api/audit/${id}" target="_blank" style="text-decoration: none;">
            <img src="${appUrl}/api/thumbnail?domain=${cleanDomain}&v=${Date.now()}" alt="Diagnostic Audit for ${cleanDomain}" style="width: 100%; max-width: 600px; border-radius: 8px; border: 1px solid #E4E4E7;" />
          </a>
          <p style="text-align: center; margin-top: 12px;">
            <a href="${appUrl}/api/audit/${id}" style="color: #2563EB; text-decoration: none; font-size: 14px; font-weight: 600;">View your forensic security report here &rarr;</a>
          </p>
        </div>
        
        <div style="margin-top: 40px; border-top: 1px solid #E4E4E7; padding-top: 20px;">
          <p style="font-size: 13px; font-weight: bold; color: #52525B;">How do you want to handle these vulnerabilities?</p>
          <div style="margin-top: 12px;">
            <p style="margin: 8px 0;"><a href="${appUrl}/api/response?id=${id}&intent=fix" style="color: #2563EB; text-decoration: none; font-size: 13px; font-weight: 500;">🟢 I want MR² Labs to fix this</a></p>
            <p style="margin: 8px 0;"><a href="${appUrl}/api/response?id=${id}&intent=nurture" style="color: #2563EB; text-decoration: none; font-size: 13px; font-weight: 500;">🟡 Send over a Loom breakdown so my team can fix it</a></p>
            <p style="margin: 8px 0;"><a href="${appUrl}/api/response?id=${id}&intent=pass" style="color: #52525B; text-decoration: none; font-size: 13px;">🔴 Not a priority right now</a></p>
          </div>
        </div>
      </div>
    `;

    const subject = email_subject || `Private Audit: ${company_name}`;
    const filename = `${company_name.replace(/[^a-zA-Z0-9]/g, '_')}_MR2Labs_Audit.pdf`;

    console.log(`[DISPATCH] Sending email via Brevo to ${email}...`);
    
    // 6. Send Email via Brevo API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: email }],
        bcc: [{ email: process.env.BCC_EMAIL || 'rashardln@gmail.com' }],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      throw new Error(`Brevo API Error: ${brevoResponse.status} ${errorText}`);
    }

    // 7. Update Lead Status to SENT
    console.log(`[DISPATCH] Email sent successfully. Updating status to SENT.`);
    await supabase
      .from('outreach_leads')
      .update({ 
        status: 'SENT', 
        sent_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
        follow_up_step: 1
      })
      .eq('id', id);

    // 8. Log the activity
    await supabase.from('activity_logs').insert({
      lead_id: id,
      event_type: 'EMAIL_SENT',
      payload: { subject, filename }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully dispatched email to ${email}`,
      leadId: id 
    });

  } catch (error: any) {
    console.error('[DISPATCH ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
