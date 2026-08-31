import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const { data: leads, error } = await supabaseAdmin
      .from('outreach_leads')
      .select(`
        id,
        email,
        company_name,
        website_url,
        email_subject,
        pitch_text,
        status,
        reply_status,
        reply_snippet,
        replied_at,
        sent_at,
        last_contacted_at,
        audit_open_count,
        audit_opened_at,
        follow_up_step,
        created_at,
        campaigns ( id, name, niche ),
        activity_logs (
          id,
          event_type,
          payload,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const formattedLeads = (leads || []).map((lead: any) => {
      const logs = lead.activity_logs || [];
      const opens = Math.max(lead.audit_open_count || 0, logs.filter((l: any) => l.event_type === 'EMAIL_OPENED').length);
      const clicks = logs.filter((l: any) => l.event_type === 'MAGIC_LINK_CLICK').length;

      // Intent calculation
      let intent = lead.reply_status || null;
      if (!intent) {
        const fixClick = logs.some((l: any) => l.payload?.action === 'fix');
        const nurtureClick = logs.some((l: any) => l.payload?.action === 'nurture');
        const passClick = logs.some((l: any) => l.payload?.action === 'pass');

        if (fixClick) intent = 'POSITIVE';
        else if (nurtureClick) intent = 'POSITIVE';
        else if (passClick) intent = 'STOP';
      }

      // Calculate score
      let score = 0;
      if (lead.status === 'SENT') score += 2;
      if (opens > 0) score += 3 * opens;
      if (clicks > 0) score += 5 * clicks;
      if (intent === 'POSITIVE' || lead.reply_status === 'POSITIVE') score += 10;
      if (intent === 'STOP' || lead.status === 'STOP') score -= 10;

      return {
        ...lead,
        campaign_name: Array.isArray(lead.campaigns) ? lead.campaigns[0]?.name : (lead.campaigns as any)?.name || 'Default Campaign',
        opens,
        clicks,
        intent,
        score: Math.max(0, score),
        logs,
      };
    });

    return NextResponse.json({ success: true, leads: formattedLeads });
  } catch (err: any) {
    console.error('[DASHBOARD LEADS API ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch leads' }, { status: 500 });
  }
}
