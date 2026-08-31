import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendColdEmail } from '@/lib/email/resend';
import { hasValidMxRecords } from '@/lib/email/validator';
import { generateFollowUpPitch } from '@/lib/ai/pitch';
import { sanitizeGreetingAndBody, formatPitchHtml } from '@/lib/email/formatter';

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export const maxDuration = 60;

export async function processSingleQueuedLead(leadId: string, followUpStep: number = 0) {
  // Global Sending Pause Check
  const { data: pauseSetting } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', 'GLOBAL_SENDING_PAUSED')
    .maybeSingle();

  if (pauseSetting?.value === true || pauseSetting?.value === 'true') {
    console.log(`[Queue Send Email] ⏸️ Execution skipped for lead ${leadId} — Global Email Sending is PAUSED.`);
    return { paused: true, message: 'Global email sending is currently paused.' };
  }

  // Fetch lead details
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('outreach_leads')
    .select('id, email, email_subject, pitch_text, audit_notes, company_name, raw_scraped_data, website_url, campaigns(niche)')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead not found or database error: ${leadId}`);
  }

  if (!lead.email) {
    throw new Error(`Lead has no email: ${leadId}`);
  }

  // Check suppression list before sending
  const { data: suppressed } = await supabaseAdmin
    .from('suppression_list')
    .select('email')
    .eq('email', lead.email.trim().toLowerCase())
    .maybeSingle();

  if (suppressed) {
    console.warn(`[Queue Send Email] Email ${lead.email} is on suppression list. Skipping and marking STOP.`);
    await supabaseAdmin.from('outreach_leads').update({ status: 'STOP', reply_status: 'STOP' }).eq('id', leadId);
    return { suppressed: true, message: `Email ${lead.email} is on suppression list.` };
  }

  // DNS MX Validation Guard
  const isValidMx = await hasValidMxRecords(lead.email);
  if (!isValidMx) {
    console.warn(`[Queue Send Email] Domain for ${lead.email} has no valid MX records. Flagging INVALID_DOMAIN.`);
    await supabaseAdmin
      .from('outreach_leads')
      .update({ status: 'INVALID_DOMAIN' })
      .eq('id', lead.id);

    return { skipped: true, reason: 'INVALID_DOMAIN', leadId: lead.id };
  }

  let subject = lead.email_subject || 'quick note';
  let pitchText = lead.pitch_text;

  // Dynamically generate AI Follow-Up if step > 0
  if (followUpStep > 0) {
    console.log(`[Queue Send Email] Generating Follow-Up Step ${followUpStep} for ${lead.company_name}`);
    const aiFollowUp = await generateFollowUpPitch(
      lead.pitch_text || '',
      followUpStep,
      lead.company_name,
      Array.isArray(lead.campaigns) ? lead.campaigns[0]?.niche : (lead.campaigns as any)?.niche,
      (lead.raw_scraped_data as any)?.founder_name || null,
      undefined,
      lead.audit_notes
    );
    subject = aiFollowUp.email_subject || subject;
    pitchText = aiFollowUp.generated_pitch;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.getmr2labs.com';
  let cleanDomain = lead.website_url;
  try {
    if (cleanDomain) {
      const urlObj = new URL(cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`);
      cleanDomain = urlObj.hostname.replace('www.', '');
    }
  } catch (e) {
    console.warn(`Could not parse URL ${lead.website_url}`);
  }

  // Sanitize greeting and format pitch HTML cleanly
  const sanitizedPitch = sanitizeGreetingAndBody(
    pitchText || '',
    (lead.raw_scraped_data as any)?.founder_name,
    lead.company_name
  );
  const formattedHtmlBody = formatPitchHtml(sanitizedPitch);

  const stepNum = (followUpStep || 0);

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

  // Trigger sendColdEmail via Resend API
  await sendColdEmail(lead.email, subject, htmlContent, textContent);

  // Update lead status to 'SENT' and record sent_at
  await supabaseAdmin
    .from('outreach_leads')
    .update({ 
      status: 'SENT',
      sent_at: new Date().toISOString()
    })
    .eq('id', lead.id);

  // Record activity log with the EXACT pitch text sent
  await supabaseAdmin
    .from('activity_logs')
    .insert({
      lead_id: lead.id,
      event_type: 'EMAIL_SENT',
      payload: { email: lead.email, subject, step: followUpStep, content: pitchText }
    });

  await supabaseAdmin
    .from('system_logs')
    .insert({
      event_type: `STEP_${followUpStep}_SENT`,
      message: `[STEP ${followUpStep}] Dispatched ${followUpStep === 0 ? 'Initial Pitch' : `Follow-up #${followUpStep}`} to ${lead.company_name} (${lead.email})`
    });

  return { success: true, leadId: lead.id };
}

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();

    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isBearerAuth = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

    // Verify QStash signature strictly if signing keys are present and request is not Bearer authenticated
    if (!isBearerAuth && receiver) {
      const signature = request.headers.get('upstash-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing QStash signature' }, { status: 401 });
      }

      const isValid = await receiver.verify({
        signature,
        body: bodyText,
      }).catch((err) => {
        console.error('[Queue Send Email] QStash signature verification failed:', err);
        return false;
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
      }
    } else if (!isBearerAuth && process.env.NODE_ENV === 'production') {
      console.warn('[Queue Send Email] Warning: QStash signing keys are missing in production environment!');
    }

    const { leadId, followUpStep = 0 } = JSON.parse(bodyText);

    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId in payload' }, { status: 400 });
    }

    const result = await processSingleQueuedLead(leadId, followUpStep);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Queue Send Email Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
