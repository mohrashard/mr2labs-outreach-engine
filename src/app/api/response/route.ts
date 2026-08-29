import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const leadId = searchParams.get('id');
  const intent = searchParams.get('intent');

  if (!leadId || !intent) {
    // Missing params, silently redirect to homepage
    return NextResponse.redirect('https://mr2labs.com');
  }

  try {
    const isTest = searchParams.get('test') === 'true' || searchParams.get('isTest') === 'true';

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
      // Note: For 'fix' or 'nurture' link clicks, we log engagement in activity_logs (above)
      // but do NOT mark status as REPLIED because REPLIED is reserved for actual email replies.
    } else {
      console.log(`[MAGIC LINK] Test click for lead ${leadId}. Preserving original lead status.`);
    }

    // 3. SMART INTENT ROUTING
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.mr2labs.com';

    if (intent === 'fix') {
      // 🟢 "I want MR² Labs to fix this" -> Redirect to Audit Landing Page (Section 5 / calendar focus)
      return NextResponse.redirect(`${appUrl}/audit/${leadId}#booking`);

    } else if (intent === 'nurture') {
      // 🟡 "Send over a Loom breakdown so my team can fix it" -> Redirect to Audit Landing Page (Form focus)
      return NextResponse.redirect(`${appUrl}/audit/${leadId}#request-loom`);

    } else {
      // 🔴 "Not a priority" (intent === 'pass')
      // Send to homepage to passively browse portfolio
      const passUrl = new URL('https://mr2labs.com');
      passUrl.searchParams.set('action', 'passed');
      return NextResponse.redirect(passUrl.toString());
    }

  } catch (error) {
    console.error('[Magic Link Error]', error);
    // Silent fail fallback to the homepage so the UX doesn't break
    return NextResponse.redirect('https://mr2labs.com');
  }
}
