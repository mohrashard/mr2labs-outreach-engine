import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Client } from '@upstash/qstash';
import { hasValidMxRecords } from '@/lib/email/validator';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    // Fetch active campaigns
    const { data: campaigns, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('id, end_date, daily_lead_limit')
      .eq('is_active', true);

    if (campaignError) throw campaignError;
    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ message: 'No active campaigns found.' });
    }

    const now = new Date();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const targetUrl = `${baseUrl}/api/queue/send-email`;

    const GLOBAL_DAILY_LIMIT = 290; 
    
    // Count emails queued/sent today to stay under free limits
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count: sentToday } = await supabaseAdmin
      .from('outreach_leads')
      .select('id', { count: 'exact', head: true })
      .in('status', ['QUEUED', 'SENT'])
      .gte('updated_at', startOfDay.toISOString());

    let totalEnqueued = sentToday || 0;

    // Follow-up sequence intervals
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const followUpQuery = `status.eq.NEW,and(status.eq.SENT,follow_up_step.eq.0,last_contacted_at.lt.${threeDaysAgo}),and(status.eq.SENT,follow_up_step.eq.1,last_contacted_at.lt.${fiveDaysAgo}),and(status.eq.SENT,follow_up_step.eq.2,last_contacted_at.lt.${tenDaysAgo})`;

    for (const campaign of campaigns) {
      if (totalEnqueued >= GLOBAL_DAILY_LIMIT) {
        console.warn('[Cron] Daily global limit reached. Stopping.');
        break; 
      }

      // Auto-expiry check
      if (campaign.end_date && new Date(campaign.end_date) < now) {
        await supabaseAdmin
          .from('campaigns')
          .update({ is_active: false })
          .eq('id', campaign.id);
        continue;
      }

      const campaignLimit = campaign.daily_lead_limit || 20;
      const remainingLimit = Math.min(campaignLimit, GLOBAL_DAILY_LIMIT - totalEnqueued);
      if (remainingLimit <= 0) break;

      // Select leads with status = 'NEW' or eligible for follow-up
      const { data: leads, error: leadsError } = await supabaseAdmin
        .from('outreach_leads')
        .select('id, email, status, follow_up_step')
        .eq('campaign_id', campaign.id)
        .or(followUpQuery)
        .neq('status', 'REPLIED')
        .not('email', 'is', null)
        .limit(remainingLimit);

      if (leadsError) throw leadsError;
      if (!leads || leads.length === 0) continue;

      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];

        // DNS MX Record Validation
        const isValidMx = await hasValidMxRecords(lead.email);
        if (!isValidMx) {
          console.warn(`[Cron] Lead ${lead.id} (${lead.email}) failed MX lookup. Setting status to INVALID_DOMAIN.`);
          await supabaseAdmin
            .from('outreach_leads')
            .update({ status: 'INVALID_DOMAIN' })
            .eq('id', lead.id);
          continue;
        }

        // Stagger each message by 15-minute intervals (i * 900 seconds)
        const delaySeconds = i * 900;
        
        const isNew = lead.status === 'NEW';
        const nextStep = isNew ? 0 : (lead.follow_up_step || 0) + 1;
        const nowIso = new Date().toISOString();

        // Update lead status to QUEUED first (Atomic Update)
        const { error: updateError } = await supabaseAdmin
          .from('outreach_leads')
          .update({ 
            status: 'QUEUED',
            follow_up_step: nextStep,
            last_contacted_at: nowIso
          })
          .eq('id', lead.id);

        if (!updateError) {
          // Enqueue job to Upstash QStash
          await qstash.publishJSON({
            url: targetUrl,
            body: { leadId: lead.id, followUpStep: nextStep },
            delay: delaySeconds,
          });
        }

        totalEnqueued++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      enqueuedJobs: totalEnqueued,
      message: `Enqueued ${totalEnqueued} total leads for outreach.` 
    });
  } catch (error: any) {
    console.error('[Cron] Daily Outreach Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026'}`) {
    return NextResponse.json({ error: 'Unauthorized manual trigger' }, { status: 401 });
  }
  return GET(request);
}
