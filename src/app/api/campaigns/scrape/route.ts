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

    // 1. Discover target domains (Queries Serper page 1 & 2 -> ~100 raw results)
    const targetLeads = await discoverTargetDomains(niche, location);

    const processedLeads = [];
    let validEmailCount = 0;

    // 2. Process discovery targets sequentially with Waterfall Enrichment
    for (const target of targetLeads) {
      // Daily Cap Guard: Break loop as soon as 20 valid enriched leads are stored
      if (validEmailCount >= 20) {
        console.log('[Scrape Pipeline] Target quota reached (20 valid enriched leads). Breaking enrichment loop.');
        break;
      }

      // Deduplicate against database
      const { data: existing } = await supabaseAdmin.from('outreach_leads').select('id').eq('website_url', target.websiteUrl).maybeSingle();
      if (existing) continue;

      // Deep enrich contact data via Waterfall (DOM -> Bouncer -> Serper Dork -> Hunter -> Apollo -> Snov)
      const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

      // If the AI Bouncer rejected this company, skip saving it to the database entirely
      if (contactData.is_rejected) {
        console.log(`[Scrape Route] Skipping database insertion for rejected lead: ${target.websiteUrl}`);
        continue;
      }

      // Generate AI audit, pitch, and email subject line using Niche Matrix
      const aiResult = await generateAuditAndPitch(target.companyName, target.websiteUrl, contactData.dom_snippet, niche);

      const status = contactData.email ? 'NEW' : 'MISSING_EMAIL';
      if (contactData.email) {
        validEmailCount++;
      }

      const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

      const leadRecord = {
        companyName: target.companyName,
        websiteUrl: target.websiteUrl,
        contactEmail: contactData.email || 'N/A',
        phone: contactData.phone,
        whatsapp: contactData.whatsapp,
        instagramUrl: contactData.instagram_url,
        linkedinUrl: contactData.linkedin_url,
        emailSubject: aiResult.email_subject,
        auditNotes: aiResult.audit_summary,
        pitchText: aiResult.generated_pitch,
        status,
        enrichmentSource: contactData.enrichment_source || 'NONE'
      };

      processedLeads.push(leadRecord);

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
          status,
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
