import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    let body: any = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch (e) {
        body = { text };
      }
    }

    // Extract sender email (support Cloudflare, Resend, Brevo, SendGrid formats)
    let senderEmail = body.from || body.sender || body['from-email'] || body.email || '';
    if (typeof senderEmail === 'object' && senderEmail.email) {
      senderEmail = senderEmail.email;
    }
    // Handle "Name <email@domain.com>" format
    if (typeof senderEmail === 'string' && senderEmail.includes('<')) {
      const match = senderEmail.match(/<([^>]+)>/);
      if (match) senderEmail = match[1];
    }
    senderEmail = String(senderEmail).trim().toLowerCase();

    if (!senderEmail) {
      return NextResponse.json({ error: 'No sender email found in request' }, { status: 400 });
    }

    // Extract reply text body
    const rawText = body.bodyText || body.text || body['body-plain'] || body.html || body.subject || '';
    const cleanText = String(rawText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const replySnippet = cleanText.substring(0, 300);

    const lowerText = cleanText.toLowerCase();

    // Positive keywords
    const positiveKeywords = ['yes', 'sure', 'send it', 'go ahead', 'interested', 'please', 'okay', 'ok', 'sounds good', 'why not', 'yes please'];
    // Stop keywords
    const stopKeywords = ['stop', 'unsubscribe', 'remove me', 'not interested', 'no thanks'];

    let classifiedStatus: 'POSITIVE' | 'STOP' | 'NEUTRAL' = 'NEUTRAL';

    const isStop = stopKeywords.some(kw => lowerText.includes(kw));
    const isPositive = positiveKeywords.some(kw => lowerText.includes(kw));

    if (isStop) {
      classifiedStatus = 'STOP';
    } else if (isPositive) {
      classifiedStatus = 'POSITIVE';
    }

    console.log(`[INBOUND REPLY] From: ${senderEmail}, Classification: ${classifiedStatus}, Snippet: "${replySnippet}"`);

    // 1. Search outreach_leads table for matching lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, email, company_name, status')
      .eq('email', senderEmail)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    if (lead) {
      // Update outreach_leads
      const newStatus = classifiedStatus === 'STOP' ? 'STOP' : 'REPLIED';

      await supabaseAdmin
        .from('outreach_leads')
        .update({
          status: newStatus,
          reply_status: classifiedStatus === 'NEUTRAL' ? 'POSITIVE' : classifiedStatus,
          replied_at: nowIso,
          reply_snippet: replySnippet,
        })
        .eq('id', lead.id);

      // Log activity
      const eventType = classifiedStatus === 'STOP' ? 'OPTED_OUT' : 'POSITIVE_REPLY';
      await supabaseAdmin.from('activity_logs').insert({
        lead_id: lead.id,
        event_type: eventType,
        payload: {
          sender: senderEmail,
          classification: classifiedStatus,
          snippet: replySnippet,
          received_at: nowIso,
        },
      });
    }

    // 2. If STOP, add to suppression_list
    if (classifiedStatus === 'STOP') {
      try {
        await supabaseAdmin.from('suppression_list').upsert(
          {
            email: senderEmail,
            opted_out_at: nowIso,
            reason: 'INBOUND_REPLY_STOP',
          },
          { onConflict: 'email' }
        );
      } catch (suppErr) {
        console.warn('[INBOUND REPLY] Suppression list warning:', suppErr);
      }
    }

    return NextResponse.json({
      success: true,
      sender: senderEmail,
      classification: classifiedStatus,
      matched_lead: lead ? lead.id : null,
      reply_snippet: replySnippet,
    });
  } catch (err: any) {
    console.error('[INBOUND REPLY API ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
