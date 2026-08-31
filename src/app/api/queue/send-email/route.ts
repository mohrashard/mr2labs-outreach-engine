import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendColdEmail } from '@/lib/email/brevo';
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

  let subject = lead.email_subject || `Quick question regarding ${lead.company_name}`;
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.mr2labs.com';
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

  let extrasHtml = '';
  if (followUpStep === 0) {
    extrasHtml = `
      <p style="text-align: center; margin: 24px 0 16px 0;">
        <a href="${appUrl}/audit/${lead.id}" style="color: #2563eb; text-decoration: none; font-weight: 600; font-size: 15px;">View the free audit of your business &rarr;</a>
      </p>
      
      <div style="margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 20px;">
        <p style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 12px;">How would you like to handle these audit findings?</p>
        <p style="margin: 8px 0; font-size: 14px;">
          🟢 <a href="${appUrl}/api/response?id=${lead.id}&action=fix" style="color: #2563eb; text-decoration: none;">I want Mr² Labs to fix this</a>
        </p>
        <p style="margin: 8px 0; font-size: 14px;">
          🟡 <a href="${appUrl}/api/response?id=${lead.id}&action=nurture" style="color: #2563eb; text-decoration: none;">Send over a Loom breakdown so my team can fix it</a>
        </p>
        <p style="margin: 8px 0; font-size: 14px;">
          🔴 <a href="${appUrl}/api/response?id=${lead.id}&action=reject" style="color: #4b5563; text-decoration: none;">Not a priority right now</a>
        </p>
      </div>
    `;
  }

  // Prepare email
  const htmlContent = `
    <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
      ${formattedHtmlBody}
      ${extrasHtml}
    </div>
  `;

  // Trigger sendColdEmail
  await sendColdEmail(lead.email, subject, htmlContent);

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
