import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.WEBHOOK_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get raw text first to debug
    const rawBody = await req.text();
    if (!rawBody) return NextResponse.json({ error: 'Empty body' }, { status: 400 });

    // 2. Safe parse
    const { senderEmail } = JSON.parse(rawBody);

    if (!senderEmail) {
      console.error('[Webhook] Missing senderEmail in payload:', rawBody);
      return NextResponse.json({ error: 'Missing senderEmail' }, { status: 400 });
    }

    const targetEmail = senderEmail.toLowerCase().trim();

    // Update Supabase: If they replied, stop the outreach
    const { data, error } = await supabaseAdmin
      .from('outreach_leads')
      .update({ status: 'REPLIED' })
      .ilike('email', targetEmail)
      .in('status', ['NEW', 'SENT', 'QUEUED']) // Do not update if already REPLIED or FINISHED
      .select('id, company_name');

    if (error) {
      console.error('[Cloudflare Webhook] Supabase update error:', error);
      throw error;
    }

    if (data && data.length > 0) {
      console.log(`[Cloudflare Webhook] Reply detected from ${targetEmail}. Status updated to REPLIED for lead ${data[0].id}.`);
    } else {
      console.log(`[Cloudflare Webhook] Reply received from ${targetEmail}, but no active matching lead was found (or already marked REPLIED).`);
    }

    return NextResponse.json({ success: true, updated: data?.length || 0 });
  } catch (err: any) {
    console.error('[Cloudflare Webhook] Syntax/DB Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to process webhook' }, { status: 500 });
  }
}
