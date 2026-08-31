import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeGreetingAndBody, formatPitchHtml } from '@/lib/email/formatter';
import { sendColdEmail } from '@/lib/email/resend';

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
    // Check Global Sending Pause Toggle
    const { data: pauseSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'GLOBAL_SENDING_PAUSED')
      .maybeSingle();

    if (pauseSetting?.value === true || pauseSetting?.value === 'true') {
      console.log('[DISPATCH] ⏸️ Skipping execution — Global Email Sending is PAUSED.');
      return NextResponse.json({ paused: true, message: 'Global email sending is currently paused.' });
    }

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

    // Check suppression list before sending
    if (email) {
      const { data: suppressed } = await supabase
        .from('suppression_list')
        .select('email')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (suppressed) {
        console.warn(`[DISPATCH] Email ${email} is on suppression list. Skipping and marking STOP.`);
        await supabase.from('outreach_leads').update({ status: 'STOP', reply_status: 'STOP' }).eq('id', id);
        return NextResponse.json({ message: `Email ${email} is suppressed, status marked STOP.` });
      }
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.getmr2labs.com';

    // Sanitize greeting and format pitch HTML cleanly
    const sanitizedPitch = sanitizeGreetingAndBody(
      pitch_text,
      lead.founder_name || raw_scraped_data?.founder_name,
      company_name
    );
    const formattedHtmlBody = formatPitchHtml(sanitizedPitch);

    const stepNum = (lead.follow_up_step || 0);

    let htmlContent = '';
    let textContent = '';

    if (stepNum === 0) {
      // Step 0 (Initial Cold Email) - Zero external links, permission CTA & opt-out footer
      htmlContent = `
        <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
          ${formattedHtmlBody}
          <p style="margin-top: 16px; font-size: 14px; line-height: 1.6; color: #333333;">
            I put together a quick 2-minute diagnostic for your team. Mind if I send it over?
          </p>
          <p style="margin-top: 24px; font-size: 11px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 12px;">
            If you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.
          </p>
        </div>
      `;

      textContent = `${sanitizedPitch
        .replace(/<[^>]*>/g, '')
        .replace(/&rarr;/g, '→')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()}\n\nI put together a quick 2-minute diagnostic for your team. Mind if I send it over?\n\nIf you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.`;
    } else if (stepNum === 1) {
      // Step 1 Follow-up - Zero links
      htmlContent = `
        <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
          <p style="margin: 0 0 16px 0;">Hi,</p>
          <p style="margin: 0 0 16px 0;">Quick follow-up on my note below regarding the 2-minute diagnostic report for <strong>${cleanDomain}</strong>. Would you like me to send it over?</p>
          <p style="margin: 20px 0 0 0;">Best,<br/>Rashard</p>
          <p style="margin-top: 24px; font-size: 11px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 12px;">
            If you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.
          </p>
        </div>
      `;

      textContent = `Hi,\n\nQuick follow-up on my note below regarding the 2-minute diagnostic report for ${cleanDomain}. Would you like me to send it over?\n\nBest,\nRashard\n\nIf you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.`;
    } else if (stepNum === 2) {
      // Step 2 Follow-up - Zero links
      htmlContent = `
        <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
          <p style="margin: 0 0 16px 0;">Hi,</p>
          <p style="margin: 0 0 16px 0;">Thought I'd bump this once more in case it got buried. Should I forward over the diagnostic breakdown for <strong>${cleanDomain}</strong>?</p>
          <p style="margin: 20px 0 0 0;">Best,<br/>Rashard</p>
          <p style="margin-top: 24px; font-size: 11px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 12px;">
            If you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.
          </p>
        </div>
      `;

      textContent = `Hi,\n\nThought I'd bump this once more in case it got buried. Should I forward over the diagnostic breakdown for ${cleanDomain}?\n\nBest,\nRashard\n\nIf you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.`;
    } else {
      // Step 3 Break-up - Zero links
      htmlContent = `
        <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
          <p style="margin: 0 0 16px 0;">Hi,</p>
          <p style="margin: 0 0 16px 0;">Assuming this isn't a priority right now, I'll close your file. Let me know if you ever want me to send over the diagnostic breakdown for <strong>${cleanDomain}</strong>.</p>
          <p style="margin: 20px 0 0 0;">Best,<br/>Rashard</p>
          <p style="margin-top: 24px; font-size: 11px; color: #888888; border-top: 1px solid #eeeeee; padding-top: 12px;">
            If you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.
          </p>
        </div>
      `;

      textContent = `Hi,\n\nAssuming this isn't a priority right now, I'll close your file. Let me know if you ever want me to send over the diagnostic breakdown for ${cleanDomain}.\n\nBest,\nRashard\n\nIf you'd prefer not to hear from me, reply with 'stop' and I'll remove you immediately.`;
    }

    const subject = email_subject || 'quick note';

    console.log(`[DISPATCH] Sending email via Resend to ${email}...`);
    
    // 6. Send Email via Resend API
    await sendColdEmail(email, subject, htmlContent, textContent);

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

    // 8. Log the activity and detailed system_log
    await supabase.from('activity_logs').insert({
      lead_id: id,
      event_type: 'EMAIL_SENT',
      payload: { subject, domain: cleanDomain, step: stepNum }
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
