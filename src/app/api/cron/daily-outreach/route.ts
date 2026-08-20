import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { discoverTargetDomains } from '@/lib/scraper/discovery';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { getNextCityDynamic } from '@/lib/scraper/cities';
import { Client } from '@upstash/qstash';
import { hasValidMxRecords } from '@/lib/email/validator';

export const maxDuration = 300; // 5 mins
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;

export async function GET(req: Request) {
  try {
    const now = new Date();

    // 1. Fetch active campaigns
    const { data: campaigns, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('is_active', true);

    if (campaignError) throw campaignError;
    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ status: 'No active campaigns' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const scrapedSummary = [];

    for (const campaign of campaigns) {
      // Auto-expiry check
      if (campaign.end_date && new Date(campaign.end_date) < now) {
        await supabaseAdmin
          .from('campaigns')
          .update({ is_active: false })
          .eq('id', campaign.id);
        continue;
      }

      const dailyLimit = campaign.daily_lead_limit || 20;

      // 2. Check daily quota for this campaign
      const { count } = await supabaseAdmin
        .from('outreach_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .gte('created_at', startOfDay.toISOString());

      if (count !== null && count >= dailyLimit) {
        console.log(`[Cron] Quota met (${count}/${dailyLimit}) for campaign: ${campaign.name}`);
        continue; 
      }

      const leadsNeeded = dailyLimit - (count || 0);
      console.log(`[Cron] Campaign "${campaign.name}" (${campaign.location}) needs ${leadsNeeded} leads.`);

      // 3. Run Discovery
      const discovered = await discoverTargetDomains(campaign.niche || 'General B2B', campaign.location);

      // 4. Auto-Pivot if city is exhausted (0 leads discovered)
      if (discovered.length === 0) {
        const exhaustedList = Array.isArray(campaign.exhausted_locations) 
          ? campaign.exhausted_locations 
          : [];
        const newCity = await getNextCityDynamic(campaign.location, exhaustedList);
        
        const updatedExhausted = [...exhaustedList, campaign.location];
        
        await supabaseAdmin
          .from('campaigns')
          .update({ location: newCity, exhausted_locations: updatedExhausted })
          .eq('id', campaign.id);
          
        console.log(`[Auto-Pivot] ${campaign.location} exhausted. Campaign updated to target ${newCity}.`);
        continue; // Next execution will scrape the new city
      }

      // 5. Run Enrichment until leadsNeeded is met
      let successCount = 0;
      for (const lead of discovered) {
        if (successCount >= leadsNeeded) break;

        // Deduplicate against DB
        const { data: existing } = await supabaseAdmin
          .from('outreach_leads')
          .select('id')
          .eq('website_url', lead.websiteUrl)
          .maybeSingle();

        if (existing) continue;

        const enriched = await deepEnrichDomain(lead.websiteUrl, lead.companyName, campaign.niche, campaign.target_personas);
        
        if (enriched.is_rejected) {
          console.log(`[Cron Scraper] Skipping rejected lead: ${lead.websiteUrl}`);
          continue;
        }

        const aiResult = await generateAuditAndPitch(lead.companyName, lead.websiteUrl, enriched.dom_snippet, campaign.niche);
        const status = enriched.email ? 'NEW' : 'MISSING_EMAIL';
        const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(lead.websiteUrl)}&screenshot=true`;

        // 6. Insert into DB
        await supabaseAdmin.from('outreach_leads').insert({
          campaign_id: campaign.id,
          company_name: lead.companyName,
          website_url: lead.websiteUrl,
          email: enriched.email,
          phone: enriched.phone,
          whatsapp: enriched.whatsapp,
          instagram_url: enriched.instagram_url,
          linkedin_url: enriched.linkedin_url,
          email_subject: aiResult.email_subject,
          audit_notes: aiResult.audit_summary,
          pitch_text: aiResult.generated_pitch,
          status,
          screenshot_url: screenshotUrl,
          raw_scraped_data: { 
            snippet: lead.snippet, 
            dom_snippet: enriched.dom_snippet,
            enrichment_source: enriched.enrichment_source 
          }
        });

        if (enriched.email) {
          successCount++;
        }
      }

      scrapedSummary.push({ campaign: campaign.name, leadsAdded: successCount });
    }

    // 7. Dispatch Email Queue via Upstash QStash (if configured)
    let enqueuedJobs = 0;
    if (qstash) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const targetUrl = `${baseUrl}/api/queue/send-email`;
      const GLOBAL_DAILY_LIMIT = Number(process.env.DAILY_EMAIL_LIMIT) || 290;

      const { count: sentToday } = await supabaseAdmin
        .from('outreach_leads')
        .select('id', { count: 'exact', head: true })
        .in('status', ['QUEUED', 'SENT'])
        .gte('updated_at', startOfDay.toISOString());

      let totalEnqueued = sentToday || 0;

      for (const campaign of campaigns) {
        if (totalEnqueued >= GLOBAL_DAILY_LIMIT) break;

        const campaignLimit = campaign.daily_lead_limit || 20;
        const remainingLimit = Math.min(campaignLimit, GLOBAL_DAILY_LIMIT - totalEnqueued);
        if (remainingLimit <= 0) break;

        const s1Days = campaign.step_1_days || 3;
        const s2Days = campaign.step_2_days || 5;
        const s3Days = campaign.step_3_days || 10;

        const cutoff1 = new Date(Date.now() - s1Days * 24 * 60 * 60 * 1000).toISOString();
        const cutoff2 = new Date(Date.now() - s2Days * 24 * 60 * 60 * 1000).toISOString();
        const cutoff3 = new Date(Date.now() - s3Days * 24 * 60 * 60 * 1000).toISOString();

        const followUpQuery = `status.eq.NEW,and(status.eq.SENT,follow_up_step.eq.0,last_contacted_at.lt.${cutoff1}),and(status.eq.SENT,follow_up_step.eq.1,last_contacted_at.lt.${cutoff2}),and(status.eq.SENT,follow_up_step.eq.2,last_contacted_at.lt.${cutoff3})`;

        const { data: leads } = await supabaseAdmin
          .from('outreach_leads')
          .select('id, email, status, follow_up_step')
          .eq('campaign_id', campaign.id)
          .or(followUpQuery)
          .neq('status', 'REPLIED')
          .not('email', 'is', null)
          .limit(remainingLimit);

        if (!leads || leads.length === 0) continue;

        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];

          const isValidMx = await hasValidMxRecords(lead.email);
          if (!isValidMx) {
            await supabaseAdmin
              .from('outreach_leads')
              .update({ status: 'INVALID_DOMAIN' })
              .eq('id', lead.id);
            continue;
          }

          const delaySeconds = i * 900;
          const isNew = lead.status === 'NEW';
          const nextStep = isNew ? 0 : (lead.follow_up_step || 0) + 1;
          const nowIso = new Date().toISOString();

          const { error: updateError } = await supabaseAdmin
            .from('outreach_leads')
            .update({ 
              status: 'QUEUED',
              follow_up_step: nextStep,
              last_contacted_at: nowIso
            })
            .eq('id', lead.id);

          if (!updateError) {
            await qstash.publishJSON({
              url: targetUrl,
              body: { leadId: lead.id, followUpStep: nextStep },
              delay: delaySeconds,
            });
            enqueuedJobs++;
            totalEnqueued++;
          }
        }
      }
    }

    return NextResponse.json({ 
      status: 'Cron Execution Complete',
      scrapedSummary,
      enqueuedJobs
    });
  } catch (error: any) {
    console.error('[Cron Error]:', error);
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
