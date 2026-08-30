import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    // 1. Verify Secret Token (Header or URL Query Parameter)
    const secret = process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026';
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    const tokenQuery = searchParams.get('token');

    const isValidHeader = authHeader === `Bearer ${secret}`;
    const isValidQuery = tokenQuery === secret;

    if (!isValidHeader && !isValidQuery && process.env.NODE_ENV === 'production') {
      console.warn('[Brevo Webhook] Unauthorized webhook invocation attempt detected.');
      return NextResponse.json({ error: 'Unauthorized webhook trigger' }, { status: 401 });
    }

    const payload = await request.json();

    // Check if it's a Brevo Transactional Event (has an "event" property)
    if (payload.event && typeof payload.event === 'string') {
      const email = payload.email?.toLowerCase()?.trim();
      if (!email) {
        return NextResponse.json({ message: 'No email found in transactional payload' }, { status: 200 });
      }

      const haltingEvents = ['hard_bounce', 'blocked', 'spam', 'unsubscribed', 'invalid_email'];
      const engagementEvents = ['opened', 'click'];
      
      if (haltingEvents.includes(payload.event) || engagementEvents.includes(payload.event)) {
        let newStatus = undefined;
        let eventType = 'UNKNOWN_EVENT';

        if (payload.event === 'spam' || payload.event === 'unsubscribed') {
          newStatus = 'UNSUBSCRIBED';
          eventType = 'DELIVERY_FAILURE';
        } else if (['hard_bounce', 'blocked', 'invalid_email'].includes(payload.event)) {
          newStatus = 'BOUNCED';
          eventType = 'DELIVERY_FAILURE';
        } else if (payload.event === 'opened') {
          eventType = 'EMAIL_OPENED';
        } else if (payload.event === 'click') {
          eventType = 'MAGIC_LINK_CLICK';
        }
        
        let updatedLeads;
        let updateError;
        
        if (newStatus) {
          const res = await supabaseAdmin
            .from('outreach_leads')
            .update({ status: newStatus })
            .ilike('email', email)
            .select('id, company_name, status');
          updatedLeads = res.data;
          updateError = res.error;
        } else {
          const res = await supabaseAdmin
            .from('outreach_leads')
            .select('id, company_name, status')
            .ilike('email', email);
          updatedLeads = res.data;
          updateError = res.error;
        }

        if (updateError) {
          console.error('[Brevo Webhook] Lead atomic query error for transactional event:', updateError);
          return NextResponse.json({ error: updateError.message }, { status: 200 });
        }

        if (updatedLeads && updatedLeads.length > 0) {
          const lead = updatedLeads[0];
          
          // Log event in activity_logs
          await supabaseAdmin
            .from('activity_logs')
            .insert({
              lead_id: lead.id,
              event_type: eventType,
              payload: {
                event: payload.event,
                email: email,
                link: payload.link || null, // Capture clicked link if available
                raw_payload: payload,
                received_at: new Date().toISOString(),
              }
            });

          console.log(`[Brevo Webhook] Lead ${lead.id} (${lead.company_name}) logged event: ${payload.event}`);
        }
      }
      return NextResponse.json({ success: true, event: payload.event });
    }

    // Flexible extraction across Brevo inbound webhook schema variants (fallback for legacy or manual inbound tests)
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
