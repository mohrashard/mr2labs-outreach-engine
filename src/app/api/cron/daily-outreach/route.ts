import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { discoverTargetDomains } from '@/lib/scraper/discovery';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { getNextCityDynamic } from '@/lib/scraper/cities';
import { Client, Receiver } from '@upstash/qstash';
import { hasValidMxRecords } from '@/lib/email/validator';

export const maxDuration = 60; // 60s max execution time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;
const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export async function GET(req: Request) {
  try {
    const startTime = Date.now();
    const url = new URL(req.url);
    const action = url.searchParams.get('action'); // 'dispatch' or 'scrape'
    const now = new Date();

    // Graceful 7-day log cleanup (only cleans system_logs; preserves outreach_leads deduplication permanently)
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('system_logs').delete().lt('created_at', sevenDaysAgo);
    } catch (e) {}

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
    startOfDay.setUTCHours(0, 0, 0, 0);

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
            await supabaseAdmin.from('system_logs').insert({
              event_type: `STEP_${nextStep}_QUEUED`,
              message: `[STEP ${nextStep}] Queued ${nextStep === 0 ? 'Initial Pitch' : `Follow-up #${nextStep}`} for ${lead.company_name || lead.email} - Scheduled for ${new Date(scheduledForIso).toLocaleTimeString()}`
            });
            enqueuedJobs++;
            totalEnqueued++;
          }
        }
      }
    }

    if (action === 'dispatch') {
      await supabaseAdmin.from('system_logs').insert({
        event_type: 'DAILY_CRON_DISPATCH_COMPLETE',
        message: `[AUTO DISPATCH] Daily outreach queue processed. Enqueued ${enqueuedJobs} follow-up email jobs.`
      });
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

        // Scraper Employee: Target is 20 fresh NEW verified leads created today for this campaign
        const { count: newLeadsToday } = await supabaseAdmin
          .from('outreach_leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'NEW')
          .gte('created_at', startOfDay.toISOString());

        const availableLeadsCount = newLeadsToday || 0;

        if (availableLeadsCount >= dailyLimit) {
          const msg = `✅ Scraper Quota Satisfied — ${availableLeadsCount}/${dailyLimit} fresh NEW leads scraped today for "${campaign.name}". No scraping needed.`;
          console.log(`[Cron] ${msg}`);
          await supabaseAdmin.from('system_logs').insert({ event_type: 'QUOTA_MET', message: msg, metadata: { campaign: campaign.name, count: availableLeadsCount, limit: dailyLimit } });
        } else {
          const leadsNeeded = dailyLimit - availableLeadsCount;
          const startMsg = `🔍 Scraper Auto-Triggered — "${campaign.name}" in ${campaign.location}: need ${leadsNeeded} more NEW verified leads for today (${availableLeadsCount}/${dailyLimit} scraped today).`;
          console.log(`[Cron] ${startMsg}`);
          await supabaseAdmin.from('system_logs').insert({ event_type: 'SCRAPE_START', message: startMsg, metadata: { campaign: campaign.name, location: campaign.location, needed: leadsNeeded } });

          // 3. Run Discovery (Deep SERP sweep) - Dual Track (DIY + Legacy)
          const diyLeads = [];
          const legacyLeads = [];
          let isTimedOut = false;

          const cronSecret = process.env.CRON_SECRET || 'mr2labs_cron_secret_key_2026';
          const scrapeContinuationUrl = `${baseUrl}/api/cron/daily-outreach?action=scrape&secret=${cronSecret}`;

          // Track 1: DIY Sites
          for (let p = 1; p <= 10; p++) {
            if (Date.now() - startTime > 45000) {
              const msg = `⏸️ 45s execution limit reached on DIY page ${p}. Scheduling 60s cooldown and resuming automatically.`;
              console.log(`[Cron] ${msg}`);
              await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: msg, metadata: { mode: 'diy', page: p, campaign: campaign.name } });
              if (qstash) {
                await qstash.publishJSON({
                  url: scrapeContinuationUrl,
                  delay: 60,
                  headers: { Authorization: `Bearer ${cronSecret}` },
                  body: {}
                }).catch((e: any) => console.error('[Cron] QStash continuation failed:', e));
              }
              isTimedOut = true;
              break;
            }

            const pageLeads = await discoverTargetDomains(campaign.niche || 'General B2B', campaign.location, p, 'diy');
            if (pageLeads.length > 0) diyLeads.push(...pageLeads);
            if (diyLeads.length >= leadsNeeded * 7) break;
          }

          // Track 2: Legacy Sites
          if (!isTimedOut) {
            for (let p = 1; p <= 10; p++) {
              if (Date.now() - startTime > 45000) {
                const msg = `⏸️ 45s execution limit reached on Legacy page ${p}. Scheduling 60s cooldown and resuming automatically.`;
                console.log(`[Cron] ${msg}`);
                await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: msg, metadata: { mode: 'legacy', page: p, campaign: campaign.name } });
                if (qstash) {
                  await qstash.publishJSON({
                    url: scrapeContinuationUrl,
                    delay: 60,
                    headers: { Authorization: `Bearer ${cronSecret}` },
                    body: {}
                  }).catch((e: any) => console.error('[Cron] QStash continuation failed:', e));
                }
                break;
              }

              const pageLeads = await discoverTargetDomains(campaign.niche || 'General B2B', campaign.location, p, 'legacy');
              if (pageLeads.length > 0) legacyLeads.push(...pageLeads);
              if (legacyLeads.length >= leadsNeeded * 7) break;
            }
          }

          // Interleave DIY and Legacy candidates 1:1 so QStash processes both tracks equally
          const discovered = [];
          const maxP = Math.max(diyLeads.length, legacyLeads.length);
          for (let i = 0; i < maxP; i++) {
            if (i < diyLeads.length) discovered.push(diyLeads[i]);
            if (i < legacyLeads.length) discovered.push(legacyLeads[i]);
          }

          // 4. Filter out already-scraped domains
          const { data: existingRecords } = await supabaseAdmin
            .from('outreach_leads')
            .select('website_url');
          const existingUrls = new Set(existingRecords?.map(r => r.website_url) || []);

          const newLeads = discovered
            .filter(lead => !existingUrls.has(lead.websiteUrl))
            .slice(0, leadsNeeded * 15);

          // Auto-Pivot if no unseen candidate leads were found in this city
          if (newLeads.length === 0) {
            const exhaustedList = Array.isArray(campaign.exhausted_locations)
              ? campaign.exhausted_locations
              : [];
            const newCity = await getNextCityDynamic(campaign.location, exhaustedList);
            const updatedExhausted = [...exhaustedList, campaign.location];

            await supabaseAdmin
              .from('campaigns')
              .update({ location: newCity, exhausted_locations: updatedExhausted })
              .eq('id', campaign.id);

            const pivotMsg = `📍 "${campaign.location}" fully exhausted for "${campaign.name}" (${discovered.length} scraped/seen). Auto-pivoting to ${newCity}...`;
            console.log(`[Auto-Pivot] ${pivotMsg}`);
            await supabaseAdmin.from('system_logs').insert({ event_type: 'LOCATION_PIVOT', message: pivotMsg, metadata: { from: campaign.location, to: newCity, campaign: campaign.name } });

            // Re-trigger scrape immediately for the new city
            if (qstash) {
              await qstash.publishJSON({
                url: scrapeContinuationUrl,
                delay: 2,
                headers: { Authorization: `Bearer ${cronSecret}` },
                body: {}
              }).catch((e: any) => console.error('[Cron] QStash auto-pivot trigger failed:', e));

              const waitMsg = `🔄 Auto-pivoted to ${newCity}. Resuming lead discovery immediately...`;
              await supabaseAdmin.from('system_logs').insert({ event_type: 'COOLDOWN', message: waitMsg, metadata: { step: 'auto_pivot', campaign: campaign.name, city: newCity } });
            }
            continue;
          }

          // 5. Run Enrichment
          if (qstash) {
            const processLeadUrl = `${baseUrl}/api/queue/process-lead`;

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
              url: scrapeContinuationUrl,
              delay: completionDelay,
              headers: { Authorization: `Bearer ${cronSecret}` },
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
  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const forwardedAuth = request.headers.get('upstash-forward-authorization');
  const signature = request.headers.get('upstash-signature');
  const userAgent = request.headers.get('user-agent') || '';

  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.NEXT_PUBLIC_CRON_SECRET,
    'mr2labs_cron_secret_key_2026'
  ].filter(Boolean) as string[];

  const validBearerSecrets = validSecrets.map(s => `Bearer ${s}`);

  let isAuthorized = false;

  // 1. Secret query param
  if (secretParam && validSecrets.includes(secretParam)) {
    isAuthorized = true;
  }
  // 2. Direct Bearer secret match
  else if (authHeader && validBearerSecrets.includes(authHeader)) {
    isAuthorized = true;
  }
  // 3. Upstash forwarded auth header
  else if (forwardedAuth && validBearerSecrets.includes(forwardedAuth)) {
    isAuthorized = true;
  }
  // 4. Vercel Cron user agent
  else if (userAgent.includes('vercel-cron')) {
    isAuthorized = true;
  }
  // 5. QStash signature verification
  else if (signature && receiver) {
    const bodyText = await request.clone().text();
    const isValid = await receiver.verify({ signature, body: bodyText }).catch(() => false);
    if (isValid) isAuthorized = true;
  }
  // 6. Fallback if QStash token is set (automated queue calls)
  else if (signature || process.env.QSTASH_TOKEN) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    console.warn('[Cron Auth Failed] Unauthorized POST trigger attempt.');
    return NextResponse.json({ error: 'Unauthorized manual trigger' }, { status: 401 });
  }

  return GET(request);
}
