import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Resend Webhook Signature Verification (Svix Standard)
 */
function verifyResendWebhook(rawBody: string, headers: Headers, secret?: string): boolean {
  if (!secret) return true;

  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Prevent replay attacks (5 min tolerance)
  const timestampNum = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 300) {
    return false;
  }

  try {
    const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const secretBytes = Buffer.from(secretKey, 'base64');
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    const signatures = svixSignature.split(' ');
    for (const sig of signatures) {
      const [version, hash] = sig.split(',');
      if (version === 'v1' && hash === expectedSignature) {
        return true;
      }
    }
  } catch (err) {
    console.error('[Resend Webhook] Signature verification error:', err);
  }

  return false;
}

/**
 * Resend Webhook Handler
 * Processes transactional, delivery, and inbound reply events:
 * - email.sent
 * - email.delivered
 * - email.delivery_delayed
 * - email.bounced
 * - email.failed
 * - email.complained
 * - email.opened
 * - email.clicked
 * - email.received (Inbound replies)
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (webhookSecret && process.env.NODE_ENV === 'production') {
      const isValid = verifyResendWebhook(rawBody, request.headers, webhookSecret);
      if (!isValid) {
        console.warn('[Resend Webhook] ⚠️ Unauthorized: Invalid Svix signature.');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!payload || !payload.type) {
      return NextResponse.json({ message: 'Invalid webhook payload structure' }, { status: 400 });
    }

    const eventType = String(payload.type).toLowerCase();
    const eventData = payload.data || {};
    
    // Extract target email:
    // For inbound 'email.received', the prospect is the sender ('from')
    // For outbound delivery events, the prospect is the recipient ('to')
    let email: string | null = null;
    if (eventType === 'email.received') {
      const rawFrom = eventData.from;
      if (typeof rawFrom === 'string') {
        const match = rawFrom.match(/<([^>]+)>/);
        email = (match ? match[1] : rawFrom).toLowerCase().trim();
      } else if (Array.isArray(rawFrom) && rawFrom.length > 0) {
        const first = rawFrom[0];
        if (typeof first === 'object' && first?.email) {
          email = String(first.email).toLowerCase().trim();
        } else {
          const match = String(first).match(/<([^>]+)>/);
          email = (match ? match[1] : String(first)).toLowerCase().trim();
        }
      }
    } else {
      if (Array.isArray(eventData.to) && eventData.to.length > 0) {
        email = String(eventData.to[0]).toLowerCase().trim();
      } else if (typeof eventData.to === 'string') {
        email = eventData.to.toLowerCase().trim();
      } else if (eventData.recipient) {
        email = String(eventData.recipient).toLowerCase().trim();
      }
    }

    if (!email) {
      return NextResponse.json({ message: 'No target email found in payload' }, { status: 200 });
    }

    const nowIso = new Date().toISOString();

    // Find lead by email
    const { data: leads } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, company_name, status, audit_open_count, sent_at')
      .ilike('email', email)
      .limit(1);

    const lead = leads && leads.length > 0 ? leads[0] : null;

    if (!lead) {
      console.log(`[Resend Webhook] No lead found matching ${email} for event ${eventType}`);
      return NextResponse.json({ success: true, message: 'Lead not found in database' }, { status: 200 });
    }

    // 1. Inbound Reply Received (Prospect replied to our email)
    if (eventType === 'email.received') {
      const rawText = eventData.text || eventData.html || eventData.snippet || '';
      const cleanText = String(rawText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const lowerText = cleanText.toLowerCase();

      const stopKeywords = ['stop', 'unsubscribe', 'remove me', 'not interested', 'no thanks'];
      const isStop = stopKeywords.some(kw => lowerText.includes(kw));
      const classifiedStatus = isStop ? 'STOP' : 'POSITIVE';
      const newStatus = isStop ? 'STOP' : 'REPLIED';

      await supabaseAdmin
        .from('outreach_leads')
        .update({
          status: newStatus,
          reply_status: classifiedStatus,
          replied_at: nowIso,
          reply_snippet: cleanText.substring(0, 300) || null,
        })
        .eq('id', lead.id);

      if (isStop) {
        await supabaseAdmin.from('suppression_list').upsert(
          { email, opted_out_at: nowIso, reason: 'INBOUND_REPLY_STOP' },
          { onConflict: 'email' }
        );
      }

      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: isStop ? 'OPTED_OUT' : 'POSITIVE_REPLY',
        payload: { event: eventType, email, classification: classifiedStatus, snippet: cleanText.substring(0, 300), received_at: nowIso },
      });

      console.log(`[Resend Webhook] Recorded INBOUND REPLY (${classifiedStatus}) from ${lead.company_name} (${email}).`);
    }

    // 2. Hard Bounce / Failed / Spam Complaint
    else if (eventType === 'email.bounced' || eventType === 'email.complained' || eventType === 'email.failed') {
      const isComplaint = eventType === 'email.complained';
      const newStatus = isComplaint ? 'UNSUBSCRIBED' : 'BOUNCED';

      await supabaseAdmin
        .from('outreach_leads')
        .update({ status: newStatus })
        .eq('id', lead.id);

      // Add to suppression list
      await supabaseAdmin
        .from('suppression_list')
        .upsert(
          {
            email,
            reason: isComplaint ? 'SPAM_COMPLAINT' : 'BOUNCE',
            created_at: nowIso,
          },
          { onConflict: 'email' }
        );

      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'DELIVERY_FAILURE',
        payload: { event: eventType, email, bounce_data: eventData.bounce || eventData.error || null, raw_payload: payload, received_at: nowIso },
      });

      console.warn(`[Resend Webhook] Recorded ${newStatus} for ${lead.company_name} (${email}). Added to suppression list.`);
    }

    // 3. Email Sent
    else if (eventType === 'email.sent') {
      await supabaseAdmin
        .from('outreach_leads')
        .update({
          status: ['NEW', 'QUEUED', 'READY_TO_SEND'].includes(lead.status) ? 'SENT' : lead.status,
          sent_at: lead.sent_at || nowIso,
        })
        .eq('id', lead.id);

      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'EMAIL_SENT',
        payload: { event: eventType, email, received_at: nowIso },
      });

      console.log(`[Resend Webhook] Recorded SENT for ${lead.company_name} (${email}).`);
    }

    // 4. Email Opened
    else if (eventType === 'email.opened') {
      const newOpens = (lead.audit_open_count || 0) + 1;
      const newStatus = ['NEW', 'QUEUED', 'SENT'].includes(lead.status) ? 'OPENED' : lead.status;

      await supabaseAdmin
        .from('outreach_leads')
        .update({
          audit_open_count: newOpens,
          audit_opened_at: nowIso,
          status: newStatus,
        })
        .eq('id', lead.id);

      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'EMAIL_OPENED',
        payload: { event: eventType, email, received_at: nowIso },
      });

      console.log(`[Resend Webhook] Recorded OPEN for ${lead.company_name} (${email}). Total opens: ${newOpens}`);
    }

    // 5. Email Clicked
    else if (eventType === 'email.clicked') {
      const newOpens = Math.max(lead.audit_open_count || 0, 1);
      const newStatus = ['NEW', 'QUEUED', 'SENT', 'OPENED'].includes(lead.status) ? 'CLICKED' : lead.status;

      await supabaseAdmin
        .from('outreach_leads')
        .update({
          audit_open_count: newOpens,
          audit_opened_at: nowIso,
          status: newStatus,
        })
        .eq('id', lead.id);

      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'MAGIC_LINK_CLICK',
        payload: { event: eventType, email, link: eventData.click?.link || null, received_at: nowIso },
      });

      console.log(`[Resend Webhook] Recorded CLICK for ${lead.company_name} (${email}).`);
    }

    // 6. Delivered
    else if (eventType === 'email.delivered') {
      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'EMAIL_DELIVERED',
        payload: { event: eventType, email, received_at: nowIso },
      });
      console.log(`[Resend Webhook] Recorded DELIVERED for ${lead.company_name} (${email}).`);
    }

    // 7. Delivery Delayed (Soft bounce / temporary greylisting)
    else if (eventType === 'email.delivery_delayed') {
      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: 'DELIVERY_DELAYED',
        payload: { event: eventType, email, reason: eventData.delayed?.reason || 'Temporary delay', received_at: nowIso },
      });
      console.warn(`[Resend Webhook] Recorded DELIVERY_DELAYED for ${lead.company_name} (${email}).`);
    }

    return NextResponse.json({ success: true, event: eventType });
  } catch (error: any) {
    console.error('[Resend Webhook Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
