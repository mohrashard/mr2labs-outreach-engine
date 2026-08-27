import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { autoDispatchPastDueLeads } from '@/lib/queue/auto-dispatcher';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // 0. Auto-dispatch any past-due queued emails immediately
    await autoDispatchPastDueLeads();

    // Determine start of today in UTC
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();

    // 1. Fetch system_logs for today (up to 200)
    const { data: systemLogs } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .gte('created_at', startOfToday)
      .order('created_at', { ascending: false })
      .limit(200);

    // Fallback: If today has fewer than 20 system logs (e.g. early morning), grab latest 50 logs regardless of date
    let rawSystemLogs = systemLogs || [];
    if (rawSystemLogs.length < 20) {
      const { data: latestSys } = await supabaseAdmin
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);
      rawSystemLogs = latestSys || [];
    }

    // 2. Fetch activity_logs for today (email dispatches, magic link clicks, replies)
    const { data: activityLogs } = await supabaseAdmin
      .from('activity_logs')
      .select('*, outreach_leads(company_name, email, follow_up_step)')
      .gte('created_at', startOfToday)
      .order('created_at', { ascending: false })
      .limit(100);

    // Transform activity_logs into normalized log format
    const transformedActivityLogs = (activityLogs || []).map(act => {
      const lead = act.outreach_leads || {};
      const company = lead.company_name || lead.email || 'Lead';
      const step = act.payload?.step !== undefined ? act.payload.step : (lead.follow_up_step || 0);

      let msg = '';
      if (act.event_type === 'EMAIL_SENT') {
        msg = `[STEP ${step}] Dispatched ${step === 0 ? 'Initial Pitch' : `Follow-up #${step}`} to ${company} (${lead.email || ''})`;
      } else if (act.event_type === 'MAGIC_LINK_CLICK') {
        msg = `[ENGAGEMENT] Lead ${company} clicked magic link (Intent: ${act.payload?.intent || 'audit'})`;
      } else if (act.event_type === 'INBOUND_REPLY') {
        msg = `[INBOUND REPLY] Received email response from ${company} (${act.payload?.sender_email || lead.email || ''})`;
      } else if (act.event_type === 'DELIVERY_FAILURE') {
        msg = `[DELIVERY FAILURE] ${act.payload?.event || 'Bounce'} recorded for ${company}`;
      } else {
        msg = `[ACTIVITY] ${act.event_type} for ${company}`;
      }

      return {
        id: `act_${act.id}`,
        event_type: act.event_type,
        message: msg,
        created_at: act.created_at,
        step: step
      };
    });

    // Normalize system logs with inferred step
    const transformedSystemLogs = rawSystemLogs.map(log => {
      let step: number | 'SYSTEM' = 'SYSTEM';
      const combined = (log.event_type + ' ' + log.message).toUpperCase();
      if (combined.includes('STEP 0') || combined.includes('STEP_0') || combined.includes('INITIAL') || combined.includes('SCRAPE') || combined.includes('DORK') || combined.includes('VERIFIED')) {
        step = 0;
      } else if (combined.includes('STEP 1') || combined.includes('STEP_1') || combined.includes('FOLLOW-UP 1') || combined.includes('FOLLOWUP 1')) {
        step = 1;
      } else if (combined.includes('STEP 2') || combined.includes('STEP_2') || combined.includes('FOLLOW-UP 2') || combined.includes('FOLLOWUP 2')) {
        step = 2;
      } else if (combined.includes('STEP 3') || combined.includes('STEP_3') || combined.includes('FOLLOW-UP 3') || combined.includes('BREAKAWAY')) {
        step = 3;
      }

      return {
        id: log.id,
        event_type: log.event_type,
        message: log.message,
        created_at: log.created_at,
        step: step
      };
    });

    // Merge & deduplicate
    const merged = [...transformedSystemLogs, ...transformedActivityLogs];
    const seen = new Set<string>();
    const deduped = merged.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ 
      date: now.toISOString().split('T')[0],
      logs: deduped 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
