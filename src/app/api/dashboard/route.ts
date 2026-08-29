import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const { count: activeCampaignsCount } = await supabaseAdmin.from('campaigns').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: totalScrapedCount } = await supabaseAdmin.from('outreach_leads').select('*', { count: 'exact', head: true });
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const { count: emailsSentToday } = await supabaseAdmin.from('outreach_leads').select('*', { count: 'exact', head: true }).eq('status', 'SENT').gte('sent_at', today.toISOString());
    
    const { count: repliedCount } = await supabaseAdmin.from('outreach_leads').select('*', { count: 'exact', head: true }).eq('status', 'REPLIED');
    const { count: totalSentEver } = await supabaseAdmin.from('outreach_leads').select('*', { count: 'exact', head: true }).not('sent_at', 'is', null);
    
    const replyRate = totalSentEver && totalSentEver > 0 ? (((repliedCount || 0) / totalSentEver) * 100).toFixed(1) : 0;

    const { data: leads } = await supabaseAdmin.from('outreach_leads').select('*').order('created_at', { ascending: false }).limit(200);

    return NextResponse.json({
      metrics: {
        activeCampaigns: activeCampaignsCount || 0,
        totalScraped: totalScrapedCount || 0,
        emailsSentToday: emailsSentToday || 0,
        totalSent: totalSentEver || 0,
        replyRate: `${replyRate}%`
      },
      leads: leads || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
