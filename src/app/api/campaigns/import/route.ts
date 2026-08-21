import { NextResponse } from 'next/server';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function cleanDomain(url: string): string {
  if (!url) return '';
  return url
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { campaignId, leads: rawLeadsInput, rawCandidates } = body;
    const leadsInput = rawLeadsInput || rawCandidates || [];

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaignId in request body.' }, { status: 400 });
    }

    if (!Array.isArray(leadsInput) || leadsInput.length === 0) {
      return NextResponse.json({ error: 'No candidates or leads provided in request payload.' }, { status: 400 });
    }

    // 1. Fetch Campaign Context
    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const niche = campaign.niche || 'General B2B';

    // 2. Fetch existing leads for deduplication
    const { data: existingLeads } = await supabaseAdmin
      .from('outreach_leads')
      .select('website_url');

    const existingDomains = new Set<string>(
      (existingLeads || [])
        .map((l: { website_url: string }) => cleanDomain(l.website_url))
        .filter(Boolean)
    );

    // 3. Filter valid & deduplicate candidates
    let duplicatesSkipped = 0;
    const candidatesToProcess: Array<{
      websiteUrl: string;
      companyName?: string;
      founderName?: string;
      linkedinUrl?: string;
    }> = [];

    for (const lead of leadsInput) {
      if (!lead.websiteUrl || typeof lead.websiteUrl !== 'string') continue;
      const normalized = cleanDomain(lead.websiteUrl);
      if (!normalized) continue;

      if (existingDomains.has(normalized)) {
        duplicatesSkipped++;
      } else {
        existingDomains.add(normalized); // Avoid intra-batch duplicates
        candidatesToProcess.push(lead);
      }
    }

    // 4. Phase 2: Sequential Deep Dive
    let processed = 0;
    let successCount = 0;
    let rejectedByBouncer = 0;
    const maxSuccessLeads = 20;

    for (const target of candidatesToProcess) {
      if (successCount >= maxSuccessLeads) break;

      processed++;
      console.log(`[CSV Import Processing ${processed}/${candidatesToProcess.length}] Evaluating: ${target.websiteUrl}`);

      // Deep enrich contact data via Waterfall (DOM -> Bouncer -> Serper Dork -> Hunter -> Apollo -> Snov)
      const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

      // AI Bouncer Check
      if (contactData.is_rejected) {
        console.log(`[CSV Import Bouncer Rejection]: ${target.websiteUrl}`);
        rejectedByBouncer++;
        continue;
      }

      // Email Verification Check
      if (!contactData.email) {
        console.log(`[CSV Import No Email]: ${target.websiteUrl}`);
        continue;
      }

      // Generate AI audit, pitch, and email subject line using Niche Matrix
      const aiResult = await generateAuditAndPitch(
        target.companyName || 'Company',
        target.websiteUrl,
        contactData.dom_snippet,
        niche
      );

      const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

      // Persist lead to Supabase
      const { error: insertErr } = await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignId,
        company_name: target.companyName || 'Company',
        website_url: target.websiteUrl,
        email: contactData.email,
        phone: contactData.phone,
        whatsapp: contactData.whatsapp,
        instagram_url: contactData.instagram_url,
        linkedin_url: target.linkedinUrl || contactData.linkedin_url,
        email_subject: aiResult.email_subject,
        audit_notes: aiResult.audit_summary,
        pitch_text: aiResult.generated_pitch,
        status: 'NEW',
        screenshot_url: screenshotUrl,
        raw_scraped_data: {
          founder_name: target.founderName || null,
          dom_snippet: contactData.dom_snippet,
          enrichment_source: contactData.enrichment_source || 'CSV_IMPORT'
        }
      });

      if (!insertErr) {
        successCount++;
        console.log(`[CSV Import Success ${successCount}/${maxSuccessLeads}]: Saved ${target.websiteUrl}`);
      } else {
        console.error(`[CSV Import DB Insert Error]: ${insertErr.message}`);
      }
    }

    return NextResponse.json({
      processed,
      successCount,
      duplicatesSkipped,
      rejectedByBouncer
    });
  } catch (error: any) {
    console.error('[CSV Import Route Error]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
