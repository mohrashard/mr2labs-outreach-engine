import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // 1. Funnel Metrics
    const { data: leads, error } = await supabaseAdmin
      .from('outreach_leads')
      .select('status, follow_up_step')
      .not('email', 'is', null);

    if (error) throw error;

    const funnel = {
      step0: leads.filter(l => l.follow_up_step === 0).length,
      step1: leads.filter(l => l.follow_up_step === 1).length,
      step2: leads.filter(l => l.follow_up_step === 2).length,
      step3: leads.filter(l => l.follow_up_step >= 3).length,
      replied: leads.filter(l => l.status === 'REPLIED').length,
    };

    // 2. Campaign Settings
    const { data: campaigns } = await supabaseAdmin
      .from('campaigns')
      .select('id, name, step_1_days, step_2_days, step_3_days')
      .eq('is_active', true);

    const campaignMap = new Map(campaigns?.map(c => [c.id, c]) || []);

    // 3. Scheduled / Waiting Room (Fetch active sequence leads)
    const { data: waitingRoom } = await supabaseAdmin
      .from('outreach_leads')
      .select('*, campaigns(name, niche)')
      .in('status', ['SENT', 'QUEUED', 'REPLIED', 'NEW'])
      .order('last_contacted_at', { ascending: true, nullsFirst: false })
      .limit(200);

    const staggerMap: Record<string, number> = {};

    const processedWaitingRoom = waitingRoom?.map(lead => {
       if (lead.status === 'SENT' && lead.last_contacted_at) {
          const camp = campaignMap.get(lead.campaign_id);
          const daysToWait = lead.follow_up_step === 0 ? (camp?.step_1_days ?? 3) :
                             lead.follow_up_step === 1 ? (camp?.step_2_days ?? 5) :
                             (camp?.step_3_days ?? 10);
          
          const nextDate = new Date(lead.last_contacted_at);
          nextDate.setDate(nextDate.getDate() + daysToWait);
          
          // Snap to 09:00 UTC (Cron Job execution time)
          nextDate.setUTCHours(9, 0, 0, 0);

          const dateKey = nextDate.toISOString().split('T')[0];
          const staggerCount = staggerMap[dateKey] || 0;
          staggerMap[dateKey] = staggerCount + 1;

          // Apply 15-minute stagger
          nextDate.setMinutes(nextDate.getMinutes() + (staggerCount * 15));

          lead.scheduled_for = nextDate.toISOString();
       }
       return lead;
    }) || [];

    return NextResponse.json({ funnel, waitingRoom: processedWaitingRoom, campaigns: campaigns || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { campaignId, step1, step2, step3 } = await req.json();
    const { error } = await supabaseAdmin
      .from('campaigns')
      .update({ step_1_days: step1, step_2_days: step2, step_3_days: step3 })
      .eq('id', campaignId);
    
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
