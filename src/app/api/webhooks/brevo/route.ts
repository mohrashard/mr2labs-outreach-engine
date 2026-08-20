import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // Flexible extraction across Brevo inbound webhook schema variants
    const senderEmail = (
      payload.sender_email || 
      payload.sender?.email || 
      payload.From || 
      payload.from || 
      payload.email
    )?.toLowerCase()?.trim();

    const subject = payload.subject || payload.Subject || payload['subject-line'] || 'Inbound Reply';

    if (!senderEmail) {
      console.warn('[Brevo Webhook] Inbound payload missing sender email:', payload);
      return NextResponse.json({ message: 'No sender email identified in payload' }, { status: 200 });
    }

    // Atomically update the lead status to 'REPLIED' and select the updated record
    const { data: updatedLeads, error: updateError } = await supabaseAdmin
      .from('outreach_leads')
      .update({ status: 'REPLIED' })
      .ilike('email', senderEmail)
      .select('id, company_name, status');

    if (updateError) {
      console.error('[Brevo Webhook] Lead status atomic update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 200 });
    }

    if (!updatedLeads || updatedLeads.length === 0) {
      console.log(`[Brevo Webhook] No matching lead found for email: ${senderEmail}`);
      return NextResponse.json({ message: 'Lead not found for sender email' }, { status: 200 });
    }

    const lead = updatedLeads[0];

    // Log event in activity_logs
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        lead_id: lead.id,
        event_type: 'INBOUND_REPLY',
        payload: {
          sender_email: senderEmail,
          subject,
          raw_payload: payload,
          received_at: new Date().toISOString(),
        }
      });

    console.log(`[Brevo Webhook] Inbound reply detected from ${senderEmail} (${lead.company_name}). Outreach sequence for lead ${lead.id} has been halted.`);

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (error: any) {
    console.error('[Brevo Webhook Error]:', error);
    // Return 200 OK so Brevo does not retry failing webhooks repeatedly
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
