import { NextResponse } from 'next/server';
import { discoverTargetDomains } from '@/lib/scraper/discovery';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Client } from '@upstash/qstash';

export const maxDuration = 60; // Returns immediately after Phase 1 discovery and QStash dispatch

const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;

export async function POST(req: Request) {
  try {
    let { campaignId, niche, location } = await req.json();

    if (!niche || !location) {
      if (!campaignId) {
        const { data: latest } = await supabaseAdmin.from('campaigns').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
        if (!latest) throw new Error("No active campaigns found to scrape.");
        campaignId = latest.id;
        niche = latest.niche;
        location = latest.location;
      } else {
        const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', campaignId).single();
        if (campaign) {
          niche = campaign.niche;
          location = campaign.location;
        }
      }
    }

    if (!campaignId) {
      const { data: latest } = await supabaseAdmin.from('campaigns').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
      if (latest) campaignId = latest.id;
    }

    const leadsNeeded = 20;
    const enqueueLimit = 80;

    // 1. Phase 1: Fast Discovery Sweep (Executes in ~3-5 seconds)
    console.log('[Scrape Pipeline] Phase 1: Aggregating raw leads from Google...');
    const rawCandidates = [];
    for (let p = 1; p <= 4; p++) {
      const pageLeads = await discoverTargetDomains(niche, location, p);
      if (pageLeads.length > 0) {
        rawCandidates.push(...pageLeads);
      }
      if (rawCandidates.length >= enqueueLimit) break;
    }
    console.log(`[Scrape Pipeline] Phase 1 Complete: Found ${rawCandidates.length} raw candidates.`);

    // 2. Offload Phase 2 to Upstash QStash Background Jobs if QSTASH_TOKEN is set (Production Async Mode)
    if (qstash) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const targetUrl = `${baseUrl}/api/queue/process-lead`;
      let enqueuedCount = 0;

      for (let i = 0; i < rawCandidates.length; i++) {
        const target = rawCandidates[i];

        // Deduplicate against database before enqueueing
        const { data: existing } = await supabaseAdmin
          .from('outreach_leads')
          .select('id')
          .eq('website_url', target.websiteUrl)
          .maybeSingle();

        if (existing) continue;

        // Stagger QStash jobs by 3 seconds per lead to prevent API rate limit spikes
        const delaySeconds = enqueuedCount * 3;

        await qstash.publishJSON({
          url: targetUrl,
          body: {
            target,
            campaignId,
            niche,
          },
          delay: delaySeconds,
        });

        enqueuedCount++;
        if (enqueuedCount >= enqueueLimit) break;
      }

      console.log(`[Scrape Pipeline] Asynchronously enqueued ${enqueuedCount} background enrichment jobs via QStash.`);

      return NextResponse.json({
        success: true,
        mode: 'ASYNC_QSTASH',
        rawDiscoveredCount: rawCandidates.length,
        enqueuedCount,
        message: `Successfully initiated async background enrichment for ${enqueuedCount} leads. Leads will populate in real-time.`
      });
    }

    // 3. Fallback: Synchronous Processing (Local Dev Mode when QSTASH_TOKEN is absent)
    console.log('[Scrape Pipeline] QSTASH_TOKEN missing. Fallback to synchronous inline processing...');
    const processedLeads = [];
    let validEmailCount = 0;

    for (const target of rawCandidates) {
      if (validEmailCount >= leadsNeeded) break;

      const { data: existing } = await supabaseAdmin.from('outreach_leads').select('id').eq('website_url', target.websiteUrl).maybeSingle();
      if (existing) continue;

      const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);
      if (contactData.is_rejected || !contactData.email) continue;

      const aiResult = await generateAuditAndPitch(target.companyName, target.websiteUrl, contactData.dom_snippet, niche);
      const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

      const leadRecord = {
        companyName: target.companyName,
        websiteUrl: target.websiteUrl,
        contactEmail: contactData.email,
        phone: contactData.phone,
        whatsapp: contactData.whatsapp,
        instagramUrl: contactData.instagram_url,
        linkedinUrl: contactData.linkedin_url,
        emailSubject: aiResult.email_subject,
        auditNotes: aiResult.audit_summary,
        pitchText: aiResult.generated_pitch,
        status: 'NEW',
        enrichmentSource: contactData.enrichment_source || 'NONE'
      };

      processedLeads.push(leadRecord);
      validEmailCount++;

      if (campaignId) {
        await supabaseAdmin.from('outreach_leads').insert({
          campaign_id: campaignId,
          company_name: target.companyName,
          website_url: target.websiteUrl,
          email: contactData.email,
          phone: contactData.phone,
          whatsapp: contactData.whatsapp,
          instagram_url: contactData.instagram_url,
          linkedin_url: contactData.linkedin_url,
          email_subject: aiResult.email_subject,
          audit_notes: aiResult.audit_summary,
          pitch_text: aiResult.generated_pitch,
          status: 'NEW',
          screenshot_url: screenshotUrl,
          raw_scraped_data: { 
            snippet: target.snippet, 
            dom_snippet: contactData.dom_snippet,
            enrichment_source: contactData.enrichment_source 
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'SYNC_FALLBACK',
      processedCount: processedLeads.length,
      validEmailCount,
      leads: processedLeads
    });
  } catch (error: any) {
    console.error('[Scrape Route Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
