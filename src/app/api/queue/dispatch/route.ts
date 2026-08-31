import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeGreetingAndBody, formatPitchHtml } from '@/lib/email/formatter';
import { sendColdEmail } from '@/lib/email/brevo';

// Configure Supabase client (Server-side only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Brevo API Key
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

// Secret token to prevent unauthorized execution (e.g. from QStash)
const CRON_SECRET = process.env.CRON_SECRET || '';

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

    // Sanitize greeting and format pitch HTML cleanly
    const sanitizedPitch = sanitizeGreetingAndBody(
      pitch_text,
      lead.founder_name || raw_scraped_data?.founder_name,
      company_name
    );
    const formattedHtmlBody = formatPitchHtml(sanitizedPitch);

    // 5. Construct Brevo Email Payload
    // Wrap the plain text pitch in a clean HTML structure
    const htmlContent = `
      <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
        ${formattedHtmlBody}
        
        <p style="text-align: center; margin: 24px 0 16px 0;">
          <a href="${appUrl}/audit/${id}" style="color: #2563eb; text-decoration: none; font-weight: 600; font-size: 15px;">View the free audit of your business &rarr;</a>
        </p>
        
        <div style="margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 20px;">
          <p style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 12px;">How would you like to handle these audit findings?</p>
          <p style="margin: 8px 0; font-size: 14px;">
            🟢 <a href="${appUrl}/api/response?id=${id}&action=fix" style="color: #2563eb; text-decoration: none;">I want Mr² Labs to fix this</a>
          </p>
          <p style="margin: 8px 0; font-size: 14px;">
            🟡 <a href="${appUrl}/api/response?id=${id}&action=nurture" style="color: #2563eb; text-decoration: none;">Send over a Loom breakdown so my team can fix it</a>
          </p>
          <p style="margin: 8px 0; font-size: 14px;">
            🔴 <a href="${appUrl}/api/response?id=${id}&action=reject" style="color: #4b5563; text-decoration: none;">Not a priority right now</a>
          </p>
        </div>
      </div>
    `;

    const subject = email_subject || `Private Audit: ${company_name}`;
    const filename = `${company_name.replace(/[^a-zA-Z0-9]/g, '_')}_MR2Labs_Audit.pdf`;

    console.log(`[DISPATCH] Sending email via Brevo to ${email}...`);
    
    // 6. Send Email via Brevo API
    await sendColdEmail(email, subject, htmlContent);

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

    const stepNum = lead.follow_up_step !== undefined ? lead.follow_up_step : 0;

    // 8. Log the activity and detailed system_log
    await supabase.from('activity_logs').insert({
      lead_id: id,
      event_type: 'EMAIL_SENT',
      payload: { subject, filename, step: stepNum }
    });

    await supabase.from('system_logs').insert({
      event_type: `STEP_${stepNum}_SENT`,
      message: `[STEP ${stepNum}] Sent ${stepNum === 0 ? 'Initial Audit Pitch' : `Follow-up #${stepNum}`} to ${company_name} (${email}) - Subject: "${subject}"`
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
