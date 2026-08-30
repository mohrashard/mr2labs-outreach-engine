import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const { leadId, intent, isTest } = await request.json();

    if (!leadId || !intent) {
      return NextResponse.json({ error: 'Missing leadId or intent' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1. Log the activity for telemetry
    await supabase.from('activity_logs').insert([
      {
        lead_id: leadId,
        event_type: isTest ? 'TEST_MAGIC_LINK_CLICK' : 'MAGIC_LINK_CLICK',
        payload: { intent, isTest, received_at: nowIso }
      },
      {
        lead_id: leadId,
        event_type: 'EMAIL_OPENED',
        payload: { type: 'INFERRED_FROM_INTENT_CLICK', intent, received_at: nowIso }
      }
    ]);

    // 2. Update Lead Status & Audit Open Count
    if (!isTest) {
      const { data: lead } = await supabase
        .from('outreach_leads')
        .select('status, audit_open_count')
        .eq('id', leadId)
        .single();

      if (lead) {
        const newOpens = Math.max(lead.audit_open_count || 0, 1);
        let newStatus = lead.status;

        if (intent === 'pass') {
          newStatus = 'UNCONTACTABLE';
        } else if (intent === 'fix') {
          newStatus = 'INTERESTED';
        } else if (['NEW', 'QUEUED', 'SENT', 'OPENED'].includes(lead.status)) {
          newStatus = 'CLICKED';
        }

        await supabase
          .from('outreach_leads')
          .update({
            status: newStatus,
            audit_open_count: newOpens,
            audit_opened_at: nowIso
          })
          .eq('id', leadId);
      }
    }

    // 3. SMART INTENT ROUTING
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.mr2labs.com';
    let redirectUrl = 'https://mr2labs.com';

    if (intent === 'fix') {
      redirectUrl = `${appUrl}/audit/${leadId}#booking`;
    } else if (intent === 'nurture') {
      redirectUrl = `${appUrl}/audit/${leadId}#request-loom`;
    } else if (intent === 'pass') {
      const passUrl = new URL('https://mr2labs.com');
      passUrl.searchParams.set('action', 'passed');
      redirectUrl = passUrl.toString();
    }

    return NextResponse.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('[Track Intent Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
