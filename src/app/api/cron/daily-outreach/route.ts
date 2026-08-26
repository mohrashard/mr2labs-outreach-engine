import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { discoverTargetDomains } from '@/lib/scraper/discovery';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { getNextCityDynamic } from '@/lib/scraper/cities';
import { Client } from '@upstash/qstash';
import { hasValidMxRecords } from '@/lib/email/validator';

export const maxDuration = 60; // 60s max execution time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;

export async function GET(req: Request) {
  try {
    const startTime = Date.now();
    const url = new URL(req.url);
    const action = url.searchParams.get('action'); // 'dispatch' or 'scrape'
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // 1. DISPATCH EMAILS FIRST (Fast)
    let enqueuedJobs = 0;
    if (qstash && (action === 'dispatch' || !action)) {
      const sendEmailUrl = `${baseUrl}/api/queue/send-email`;
      const GLOBAL_DAILY_LIMIT = Number(process.env.DAILY_EMAIL_LIMIT) || 290;

      const { count: sentToday } = await supabaseAdmin
        .from('outreach_leads')
        .select('id', { count: 'exact', head: true })
        .in('status', ['QUEUED', 'SENT'])
        .gte('updated_at', startOfDay.toISOString());

      let totalEnqueued = sentToday || 0;
      console.log(`[Cron Debug] sentToday/totalEnqueued = ${totalEnqueued}`);

      for (const campaign of campaigns) {
        if (totalEnqueued >= GLOBAL_DAILY_LIMIT) {
          console.log(`[Cron Debug] GLOBAL_DAILY_LIMIT reached.`);
          break;
        }

        const campaignLimit = campaign.daily_lead_limit || 20;
        const globalRemaining = GLOBAL_DAILY_LIMIT - totalEnqueued;
        
        if (globalRemaining <= 0) break;

        const s1Days = campaign.step_1_days || 3;
        const s2Days = campaign.step_2_days || 5;
        const s3Days = campaign.step_3_days || 10;

        const cutoff1 = new Date(Date.now() - s1Days * 24 * 60 * 60 * 1000).toISOString();
        const cutoff2 = new Date(Date.now() - s2Days * 24 * 60 * 60 * 1000).toISOString();
        const cutoff3 = new Date(Date.now() - s3Days * 24 * 60 * 60 * 1000).toISOString();

        // 1. First, fetch eligible follow-up leads (No limit other than global daily 290)
        const { data: sentLeads } = await supabaseAdmin
          .from('outreach_leads')
          .select('id, email, status, follow_up_step, last_contacted_at')
          .eq('campaign_id', campaign.id)
          .eq('status', 'SENT')
          .not('email', 'is', null)
          .limit(200);

        let followUps: any[] = [];
        if (sentLeads && sentLeads.length > 0) {
          followUps = sentLeads.filter(l => {
            if (!l.last_contacted_at) return false;
            const lastContact = new Date(l.last_contacted_at).getTime();
            const step = l.follow_up_step || 0;
            if (step === 0 && lastContact < new Date(cutoff1).getTime()) return true;
            if (step === 1 && lastContact < new Date(cutoff2).getTime()) return true;
            if (step === 2 && lastContact < new Date(cutoff3).getTime()) return true;
            return false;
          }).slice(0, globalRemaining);
        }

        let leads = [...followUps];

        // 2. Enforce the strict 20-lead limit for NEW Step 0 emails only
        const { count: step0SentToday } = await supabaseAdmin
          .from('outreach_leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('status', ['QUEUED', 'SENT'])
          .eq('follow_up_step', 0)
          .gte('updated_at', startOfDay.toISOString());

        const remainingNewLeadLimit = Math.max(0, Math.min(campaignLimit - (step0SentToday || 0), globalRemaining - followUps.length));

        // 3. Fill remaining queue space with new leads
        if (remainingNewLeadLimit > 0) {
          const { data: newLeads } = await supabaseAdmin
            .from('outreach_leads')
            .select('id, email, status, follow_up_step')
            .eq('campaign_id', campaign.id)
            .eq('status', 'NEW')
            .not('email', 'is', null)
            .limit(remainingNewLeadLimit);

          if (newLeads && newLeads.length > 0) {
            leads = [...leads, ...newLeads];
          }
        }
        
        console.log(`[Cron Debug] Campaign "${campaign.name}" fetched ${leads.length} leads eligible for queue.`);

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
          const scheduledForIso = new Date(Date.now() + delaySeconds * 1000).toISOString();
          const isNew = lead.status === 'NEW';
          const nextStep = isNew ? 0 : (lead.follow_up_step || 0) + 1;
          const nowIso = new Date().toISOString();

          const { error: updateError } = await supabaseAdmin
            .from('outreach_leads')
            .update({ 
              status: 'QUEUED',
              scheduled_for: scheduledForIso,
              follow_up_step: nextStep,
              last_contacted_at: nowIso
            })
            .eq('id', lead.id);

          if (!updateError) {
            try {
              await qstash.publishJSON({
                url: sendEmailUrl,
                body: { leadId: lead.id, followUpStep: nextStep },
                delay: delaySeconds,
              });
            } catch (qstashErr: any) {
              console.warn(`[Cron] QStash publish skipped (${qstashErr.message}).`);
            }
            enqueuedJobs++;
            totalEnqueued++;
          }
        }
      }
    }

    if (action === 'dispatch') {
      return NextResponse.json({ 
        status: 'Dispatch Complete',
        enqueuedJobs
      });
    }

    // 2. DISCOVERY & ENRICHMENT NEXT (Slow)
    if (action === 'scrape' || !action) {
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

      // 2. Check quota — only count NEW leads (verified, not yet dispatched).
      // SENT/QUEUED are already dispatched and don't count toward the scraping goal.
      const { count: newLeadCount } = await supabaseAdmin
        .from('outreach_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'NEW');

      const availableLeadsCount = newLeadCount || 0;

      if (availableLeadsCount >= dailyLimit) {
        const msg = `✅ Quota already satisfied — ${availableLeadsCount}/${dailyLimit} verified leads ready for "${campaign.name}". No scraping needed.`;
        console.log(`[Cron] ${msg}`);
        await supabaseAdmin.from('system_logs').insert({ event_type: 'QUOTA_MET', message: msg, metadata: { campaign: campaign.name, count: availableLeadsCount, limit: dailyLimit } });
      } else {
        const leadsNeeded = dailyLimit - availableLeadsCount;
        const startMsg = `🔍 Starting discovery for "${campaign.name}" in ${campaign.location} — need ${leadsNeeded} more verified leads (${availableLeadsCount}/${dailyLimit} already in queue).`;
        console.log(`[Cron] ${startMsg}`);
        await supabaseAdmin.from('system_logs').insert({ event_type: 'SCRAPE_START', message: startMsg, metadata: { campaign: campaign.name, location: campaign.location, needed: leadsNeeded } });

        // 3. Run Discovery (Deep SERP sweep) - Dual Track (DIY + Legacy)
        const discovered = [];
        let isTimedOut = false;

        // Track 1: DIY Sites
        for (let p = 1; p <= 5; p++) {
          if (Date.now() - startTime > 45000) {
            const msg = `⏸️ 45s execution limit reached on DIY page ${p}. Scheduling 60s cooldown and resuming automatically.`;
            console.log(`[Cron] ${msg}`);
            await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: msg, metadata: { mode: 'diy', page: p, campaign: campaign.name } });
            if (qstash) {
              await qstash.publishJSON({
                url: `${baseUrl}/api/cron/daily-outreach?action=scrape`,
                delay: 60,
                headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026'}` },
                body: {}
              }).catch((e: any) => console.error('[Cron] QStash continuation failed:', e));
            }
            isTimedOut = true;
            break;
          }

          const pageLeads = await discoverTargetDomains(campaign.niche || 'General B2B', campaign.location, p, 'diy');
          if (pageLeads.length > 0) discovered.push(...pageLeads);
          if (discovered.length >= leadsNeeded * 7) break; 
        }

        // Track 2: Legacy Sites
        if (!isTimedOut) {
          for (let p = 1; p <= 5; p++) {
            if (Date.now() - startTime > 45000) {
              const msg = `⏸️ 45s execution limit reached on Legacy page ${p}. Scheduling 60s cooldown and resuming automatically.`;
              console.log(`[Cron] ${msg}`);
              await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: msg, metadata: { mode: 'legacy', page: p, campaign: campaign.name } });
              if (qstash) {
                await qstash.publishJSON({
                  url: `${baseUrl}/api/cron/daily-outreach?action=scrape`,
                  delay: 60,
                  headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026'}` },
                  body: {}
                }).catch((e: any) => console.error('[Cron] QStash continuation failed:', e));
              }
              break;
            }

            const pageLeads = await discoverTargetDomains(campaign.niche || 'General B2B', campaign.location, p, 'legacy');
            if (pageLeads.length > 0) discovered.push(...pageLeads);
            if (discovered.length >= leadsNeeded * 15) break;
          }
        }

        // 4. Auto-Pivot if city is exhausted
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
          
          const pivotMsg = `📍 "${campaign.location}" fully exhausted for "${campaign.name}". Auto-pivoting to ${newCity} for next scrape cycle.`;
          console.log(`[Auto-Pivot] ${pivotMsg}`);
          await supabaseAdmin.from('system_logs').insert({ event_type: 'LOCATION_PIVOT', message: pivotMsg, metadata: { from: campaign.location, to: newCity, campaign: campaign.name } });
          continue; 
        }

        // 5. Run Enrichment
        if (qstash) {
          const processLeadUrl = `${baseUrl}/api/queue/process-lead`;
          
          const { data: existingRecords } = await supabaseAdmin
            .from('outreach_leads')
            .select('website_url');
          const existingUrls = new Set(existingRecords?.map(r => r.website_url) || []);
          
          const newLeads = discovered
            .filter(lead => !existingUrls.has(lead.websiteUrl))
            .slice(0, leadsNeeded * 15); 

          const publishPromises = newLeads.map((lead, index) => {
            return qstash.publishJSON({
              url: processLeadUrl,
              body: {
                target: lead,
                campaignId: campaign.id,
                niche: campaign.niche,
              },
              delay: index * 3, 
            }).catch(err => console.warn(`[Cron] QStash publish skipped (${err.message})`));
          });

          await Promise.all(publishPromises);

          const enqueueMsg = `📬 Dispatched ${newLeads.length} candidates to the background Bouncer for "${campaign.name}". Goal: ${leadsNeeded} verified leads.`;
          console.log(`[Cron] ${enqueueMsg}`);
          await supabaseAdmin.from('system_logs').insert({ event_type: 'SCRAPE_ENQUEUED', message: enqueueMsg, metadata: { campaign: campaign.name, enqueued: newLeads.length, needed: leadsNeeded } });
          scrapedSummary.push({ campaign: campaign.name, mode: 'ASYNC_QSTASH', enqueuedForScrape: newLeads.length });

          // Schedule a verification re-run after the queue clears
          const completionDelay = (newLeads.length * 3) + 30;
          await qstash.publishJSON({
            url: `${baseUrl}/api/cron/daily-outreach?action=scrape`,
            delay: completionDelay,
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026'}` },
            body: {}
          }).catch((e: any) => console.error('[Cron] QStash completion check failed:', e));
          
          const waitMsg = `⏳ Waiting ~${completionDelay}s for Bouncer to verify ${newLeads.length} candidates. Will re-check quota automatically — need ${leadsNeeded} more NEW leads for "${campaign.name}".`;
          console.log(`[Cron] ${waitMsg}`);
          await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: waitMsg, metadata: { step: 'queue_wait', campaign: campaign.name, delay: completionDelay } });
        } else {
          let successCount = 0;
          for (const lead of discovered) {
            if (successCount >= leadsNeeded) break;

            // 48-second killswitch during synchronous enrichment
            if (Date.now() - startTime > 48000) {
              const msg = `⏸️ 48s limit reached during sync enrichment for "${campaign.name}". Pausing — restart the cron to resume.`;
              console.log(`[Cron] ${msg}`);
              await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: msg, metadata: { step: 'enrichment', campaign: campaign.name } });
              break;
            }

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
          scrapedSummary.push({ campaign: campaign.name, mode: 'SYNC_FALLBACK', leadsAdded: successCount });
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
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.NEXT_PUBLIC_CRON_SECRET,
    'mr2labs_cron_secret_key_2026'
  ].filter(Boolean).map(s => `Bearer ${s}`);

  if (!authHeader || !validSecrets.includes(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized manual trigger' }, { status: 401 });
  }
  return GET(request);
}
