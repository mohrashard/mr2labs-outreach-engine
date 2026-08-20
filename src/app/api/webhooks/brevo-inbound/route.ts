import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { classifyEmailResponse } from '@/lib/ai/groq';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Brevo inbound webhook payload parsing
    let senderEmail = '';
    let emailText = '';

    if (body.items && body.items.length > 0) {
      const item = body.items[0];
      senderEmail = item.From?.Address || item.From || item.from?.address || item.from || '';
      emailText = item.TextBody || item.textBody || item.RawTextBody || item.rawTextBody || item.RawHtmlBody || '';
    } else {
      senderEmail = body.from || body.From || body.email || '';
      emailText = body.text || body.textBody || body.content || body.RawHtmlBody || '';
    }

    if (typeof senderEmail === 'object') {
       senderEmail = (senderEmail as any).address || (senderEmail as any).email || '';
    }

    if (!senderEmail) {
      return NextResponse.json({ error: 'Sender email not found in payload' }, { status: 400 });
    }

    // Match the incoming sender email to outreach_leads
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, status')
      .ilike('email', senderEmail)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ message: 'No matching lead found for email: ' + senderEmail });
    }

    // Update matching lead status = 'REPLIED' to stop any further drip outreach
    await supabaseAdmin
      .from('outreach_leads')
      .update({ status: 'REPLIED' })
      .eq('id', lead.id);

    // Run response text through AI intent classification
    const intent = await classifyEmailResponse(emailText);

    // Save classification output into activity_logs
    await supabaseAdmin
      .from('activity_logs')
      .insert({
        lead_id: lead.id,
        event_type: 'INBOUND_REPLY',
        payload: { 
          intent,
          email_text: emailText.substring(0, 1000) // Store snippet for manual review
        }
      });

    return NextResponse.json({ success: true, leadId: lead.id, intent });

  } catch (error: any) {
    console.error('[Webhook] Brevo Inbound Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
