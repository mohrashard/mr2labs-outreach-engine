import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendColdEmail } from '@/lib/email/brevo';
import { hasValidMxRecords } from '@/lib/email/validator';

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();

    // Verify QStash signature strictly if signing keys are present
    if (receiver) {
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
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[Queue Send Email] Warning: QStash signing keys are missing in production environment!');
    }

    const { leadId } = JSON.parse(bodyText);

    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId in payload' }, { status: 400 });
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, email, email_subject, pitch_text, company_name')
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
        
      return NextResponse.json({ 
        skipped: true, 
        reason: 'INVALID_DOMAIN', 
        leadId: lead.id 
      });
    }

    // Prepare email
    const subject = lead.email_subject || `Quick question regarding ${lead.company_name}`;
    const htmlContent = `
      <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
        <p>Hi there,</p>
        <p>${lead.pitch_text}</p>
        <p>Best regards,<br/>MR² Labs Team</p>
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

    // Record activity log
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        lead_id: lead.id,
        event_type: 'EMAIL_SENT',
        payload: { email: lead.email, subject }
      });

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (error: any) {
    console.error('[Queue Send Email Error]:', error);
    // Returning 500 status code triggers automatic QStash retry for failed jobs
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
