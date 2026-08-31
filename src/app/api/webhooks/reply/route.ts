import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;

    if (secret && authHeader !== `Bearer ${secret}` && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.text();
    if (!rawBody) return NextResponse.json({ error: 'Empty body' }, { status: 400 });

    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      body = { text: rawBody };
    }

    let senderEmail = body.senderEmail || body.from || body.sender || body.email || '';
    if (typeof senderEmail === 'object' && senderEmail.email) {
      senderEmail = senderEmail.email;
    }
    if (typeof senderEmail === 'string' && senderEmail.includes('<')) {
      const match = senderEmail.match(/<([^>]+)>/);
      if (match) senderEmail = match[1];
    }
    senderEmail = String(senderEmail).trim().toLowerCase();

    if (!senderEmail) {
      return NextResponse.json({ error: 'Missing senderEmail' }, { status: 400 });
    }

    const rawText = body.text || body.body || body.snippet || '';
    const cleanText = String(rawText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const lowerText = cleanText.toLowerCase();

    // Intent classification
    const stopKeywords = ['stop', 'unsubscribe', 'remove me', 'not interested', 'no thanks'];
    const positiveKeywords = ['yes', 'sure', 'send it', 'go ahead', 'interested', 'please', 'okay', 'ok', 'sounds good', 'why not', 'yes please'];

    let classifiedStatus: 'POSITIVE' | 'STOP' = 'POSITIVE';
    if (stopKeywords.some(kw => lowerText.includes(kw))) {
      classifiedStatus = 'STOP';
    }

    const nowIso = new Date().toISOString();

    // Update Supabase lead
    const newLeadStatus = classifiedStatus === 'STOP' ? 'STOP' : 'REPLIED';

    const { data: updatedLeads, error: dbErr } = await supabaseAdmin
      .from('outreach_leads')
      .update({
        status: newLeadStatus,
        reply_status: classifiedStatus,
        replied_at: nowIso,
        reply_snippet: cleanText.substring(0, 300) || null,
      })
      .ilike('email', senderEmail)
      .select('id, company_name');

    if (dbErr) {
      console.error('[Cloudflare Webhook] Supabase update error:', dbErr);
    }

    // If STOP, add to suppression list
    if (classifiedStatus === 'STOP') {
      try {
        await supabaseAdmin.from('suppression_list').upsert(
          { email: senderEmail, opted_out_at: nowIso, reason: 'INBOUND_REPLY_STOP' },
          { onConflict: 'email' }
        );
      } catch (suppErr) {
        console.warn('[Cloudflare Webhook] Suppression list warning:', suppErr);
      }
    }

    if (updatedLeads && updatedLeads.length > 0) {
      await supabaseAdmin.from('activity_logs').insert({
        lead_id: updatedLeads[0].id,
        event_type: classifiedStatus === 'STOP' ? 'OPTED_OUT' : 'POSITIVE_REPLY',
        payload: { sender: senderEmail, classification: classifiedStatus, snippet: cleanText.substring(0, 300) },
      });
    }

    return NextResponse.json({
      success: true,
      sender: senderEmail,
      classification: classifiedStatus,
      updated_leads: updatedLeads?.length || 0,
    });
  } catch (err: any) {
    console.error('[Cloudflare Webhook] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to process webhook' }, { status: 500 });
  }
}
