import { NextResponse } from 'next/server';
import { discoverTargetDomains } from '@/lib/scraper/discovery';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 300;

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

    const processedLeads = [];
    let validEmailCount = 0;
    const leadsNeeded = 20;

    // 1. Phase 1: Discovery Sweep
    console.log('[Scrape Pipeline] Phase 1: Aggregating raw leads from Google...');
    const rawCandidates = [];
    for (let p = 1; p <= 5; p++) {
      const pageLeads = await discoverTargetDomains(niche, location, p);
      if (pageLeads.length > 0) {
        rawCandidates.push(...pageLeads);
      }
    }
    console.log(`[Scrape Pipeline] Phase 1 Complete: Found ${rawCandidates.length} raw candidates.`);

    // 2. Phase 2: Sequential Deep Dive
    console.log('[Scrape Pipeline] Phase 2: Sequential Deep Dive...');
    for (const target of rawCandidates) {
      if (validEmailCount >= leadsNeeded) break;

      console.log(`[Processing Lead] Evaluating: ${target.websiteUrl}`);

      // Deduplicate against database
      const { data: existing } = await supabaseAdmin.from('outreach_leads').select('id').eq('website_url', target.websiteUrl).maybeSingle();
      if (existing) continue;

      // Deep enrich contact data via Waterfall (DOM -> Bouncer -> Serper Dork -> Hunter -> Apollo -> Snov)
      const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

      // If the AI Bouncer rejected this company, skip saving it to the database entirely
      if (contactData.is_rejected) {
        console.log(`[Bouncer] Rejected: ${target.websiteUrl}`);
        continue;
      }

      if (!contactData.email) {
        console.log(`[Enrichment] No verified email found for: ${target.websiteUrl}`);
        continue;
      }

      // Generate AI audit, pitch, and email subject line using Niche Matrix
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
      console.log(`[Success] Saved lead ${validEmailCount}/${leadsNeeded}: ${target.websiteUrl}`);

      // Persist to Supabase
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
      processedCount: processedLeads.length,
      validEmailCount,
      leads: processedLeads
    });
  } catch (error: any) {
    console.error('[Scrape Route Error]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
