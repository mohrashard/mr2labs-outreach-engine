import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { data: leads, error } = await supabase
      .from('outreach_leads')
      .select(`
        id,
        email,
        company_name,
        website_url,
        email_subject,
        sent_at,
        status,
        audit_open_count,
        audit_opened_at,
        follow_up_step,
        campaigns ( name ),
        activity_logs (
          event_type,
          payload,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const trackerData = leads.map((lead: any) => {
      const logs = lead.activity_logs || [];

      let times_opened = lead.audit_open_count || 0;
      let times_clicked = 0;
      let intent_selected: string | null = null;
      let last_active_at: string | null = lead.audit_opened_at || lead.sent_at || null;

      // Track click timestamps to deduplicate clicks within 10 seconds
      const clickTimestamps: number[] = [];

      // Extract sequence step history
      const sequence_history: Array<{ step: number; event: string; timestamp: string }> = [];

      logs.forEach((log: any) => {
        const timestamp = new Date(log.created_at).getTime();

        if (!last_active_at || timestamp > new Date(last_active_at).getTime()) {
          last_active_at = log.created_at;
        }

        if (log.event_type === 'EMAIL_SENT') {
          sequence_history.push({
            step: log.payload?.step ?? 0,
            event: 'EMAIL_SENT',
            timestamp: log.created_at
          });
        } else if (log.event_type === 'EMAIL_OPENED') {
          times_opened++;
          sequence_history.push({
            step: lead.follow_up_step || 0,
            event: 'EMAIL_OPENED',
            timestamp: log.created_at
          });
        } else if (log.event_type === 'MAGIC_LINK_CLICK' || log.event_type === 'TEST_MAGIC_LINK_CLICK') {
          const isDuplicate = clickTimestamps.some(t => Math.abs(t - timestamp) < 10000);
          if (!isDuplicate) {
            times_clicked++;
            clickTimestamps.push(timestamp);

            if (log.payload?.intent) {
              intent_selected = log.payload.intent;
            }

            sequence_history.push({
              step: lead.follow_up_step || 0,
              event: 'MAGIC_LINK_CLICK',
              timestamp: log.created_at
            });
          }
        } else if (log.event_type === 'INBOUND_REPLY') {
          if (log.payload?.intent) {
            intent_selected = log.payload.intent;
          }
          sequence_history.push({
            step: lead.follow_up_step || 0,
            event: 'INBOUND_REPLY',
            timestamp: log.created_at
          });
        }
      });

      // Logical integrity check: clicks without opens is impossible
      if (times_clicked > 0 && times_opened === 0) {
        times_opened = Math.max(times_clicked, 1);
      }

      // If prospect has clicked or engaged, fallback intent to 'nurture' if unset
      if (!intent_selected && times_clicked > 0) {
        intent_selected = 'nurture';
      }

      // Calculate engagement score
      let score = (times_opened * 2) + (times_clicked * 3);
      if (intent_selected === 'fix') score += 10;
      if (intent_selected === 'nurture') score += 5;

      const days_since_contact = lead.sent_at 
        ? Math.floor((Date.now() - new Date(lead.sent_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Sort sequence history chronologically
      sequence_history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return {
        id: lead.id,
        company_name: lead.company_name,
        email: lead.email,
        subject: lead.email_subject || '',
        sent_at: lead.sent_at,
        status: lead.status,
        follow_up_step: lead.follow_up_step || 0,
        campaign: Array.isArray(lead.campaigns) ? lead.campaigns[0]?.name : lead.campaigns?.name,
        website_url: lead.website_url,
        times_opened,
        times_clicked,
        intent_selected,
        last_active_at: last_active_at || lead.sent_at || null,
        days_since_contact,
        engagement_score: score,
        sequence_history
      };
    });

    return NextResponse.json({ success: true, data: trackerData });
  } catch (error: any) {
    console.error('Tracker API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
