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

    // 1. Log the activity for telemetry
    await supabase.from('activity_logs').insert({
      lead_id: leadId,
      event_type: isTest ? 'TEST_MAGIC_LINK_CLICK' : 'MAGIC_LINK_CLICK',
      payload: { intent, isTest }
    });

    // 2. Determine Database Status based on Intent (Only if not a test click)
    if (!isTest) {
      if (intent === 'pass') {
        // Respect their time, stop follow-ups
        await supabase
          .from('outreach_leads')
          .update({ status: 'UNCONTACTABLE' })
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
