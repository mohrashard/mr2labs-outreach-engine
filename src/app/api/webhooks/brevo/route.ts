import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // 1. Check if it's a Brevo Transactional Event (has an "event" property)
    if (payload.event && typeof payload.event === 'string') {
      const email = (payload.email || payload['email-id'] || payload.recipient)?.toLowerCase()?.trim();
      if (!email) {
        return NextResponse.json({ message: 'No email found in transactional payload' }, { status: 200 });
      }

      const haltingEvents = ['hard_bounce', 'soft_bounce', 'blocked', 'spam', 'unsubscribed', 'invalid_email'];
      const eventName = payload.event.toLowerCase();
      const nowIso = new Date().toISOString();

      const { data: leads } = await supabaseAdmin
        .from('outreach_leads')
        .select('id, company_name, status, audit_open_count')
        .ilike('email', email);

      if (leads && leads.length > 0) {
        const lead = leads[0];

        if (haltingEvents.includes(eventName)) {
          const newStatus = (eventName === 'spam' || eventName === 'unsubscribed') ? 'UNSUBSCRIBED' : 'BOUNCED';
          await supabaseAdmin
            .from('outreach_leads')
            .update({ status: newStatus })
            .eq('id', lead.id);

          await supabaseAdmin.from('activity_logs').insert({
            lead_id: lead.id,
            event_type: 'DELIVERY_FAILURE',
            payload: { event: eventName, email, raw_payload: payload, received_at: nowIso }
          });
        } else if (eventName === 'opened' || eventName === 'unique_opened') {
          const newOpens = (lead.audit_open_count || 0) + 1;
          const newStatus = ['NEW', 'QUEUED', 'SENT'].includes(lead.status) ? 'OPENED' : lead.status;

          await supabaseAdmin
            .from('outreach_leads')
            .update({
              audit_open_count: newOpens,
              audit_opened_at: nowIso,
              status: newStatus
            })
            .eq('id', lead.id);

          await supabaseAdmin.from('activity_logs').insert({
            lead_id: lead.id,
            event_type: 'EMAIL_OPENED',
            payload: { event: eventName, email, received_at: nowIso }
          });

          console.log(`[Brevo Webhook] Recorded OPEN for ${lead.company_name} (${email}). Total opens: ${newOpens}`);
        } else if (eventName === 'click' || eventName === 'unique_click') {
          const newOpens = Math.max(lead.audit_open_count || 0, 1);
          const newStatus = ['NEW', 'QUEUED', 'SENT', 'OPENED'].includes(lead.status) ? 'CLICKED' : lead.status;

          await supabaseAdmin
            .from('outreach_leads')
            .update({
              audit_open_count: newOpens,
              audit_opened_at: nowIso,
              status: newStatus
            })
            .eq('id', lead.id);

          await supabaseAdmin.from('activity_logs').insert({
            lead_id: lead.id,
            event_type: 'MAGIC_LINK_CLICK',
            payload: { event: eventName, email, link: payload.link || null, received_at: nowIso }
          });

          // Ensure an EMAIL_OPENED activity log is also recorded so opens metric is never 0 on click
          await supabaseAdmin.from('activity_logs').insert({
            lead_id: lead.id,
            event_type: 'EMAIL_OPENED',
            payload: { event: 'inferred_open_from_click', email, received_at: nowIso }
          });

          console.log(`[Brevo Webhook] Recorded CLICK for ${lead.company_name} (${email}).`);
        }
      }

      return NextResponse.json({ success: true, event: payload.event });
    }

    // 2. Inbound Reply Processing
    const senderEmail = (
      payload.sender_email || 
      payload.sender?.email || 
      payload.From || 
      payload.from || 
      payload.email
    )?.toLowerCase()?.trim();

    if (senderEmail) {
      const nowIso = new Date().toISOString();
      const { data: updatedLeads } = await supabaseAdmin
        .from('outreach_leads')
        .update({ status: 'REPLIED' })
        .ilike('email', senderEmail)
        .select('id, company_name');

      if (updatedLeads && updatedLeads.length > 0) {
        await supabaseAdmin.from('activity_logs').insert({
          lead_id: updatedLeads[0].id,
          event_type: 'INBOUND_REPLY',
          payload: { sender_email: senderEmail, received_at: nowIso }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Brevo Webhook Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
