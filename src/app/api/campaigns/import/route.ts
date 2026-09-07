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

    // 1. Fetch Campaign Context (Active, Inactive, or Fallback Pool)
    let campaign: any = null;
    let niche = 'General B2B';

    if (campaignId && campaignId !== 'pool') {
      const { data: c } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .maybeSingle();
      if (c) {
        campaign = c;
        niche = campaign.niche || 'General B2B';
      }
    }

    if (!campaign) {
      // Find latest campaign (active or inactive)
      const { data: fallbackCampaign } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallbackCampaign) {
        campaign = fallbackCampaign;
        niche = campaign.niche || 'General B2B';
      } else {
        // Create standard Default Inbound / CSV Pool campaign if zero campaigns exist in DB
        const { data: created } = await supabaseAdmin
          .from('campaigns')
          .insert({
            name: 'Default Lead Pool (Unassigned)',
            niche: 'B2B Services',
            location: 'Global',
            is_active: false
          })
          .select()
          .single();
        campaign = created;
      }
    }

    const campaignDbId = campaign?.id;

    // 2. Fetch existing leads for domain & email deduplication
    const { data: existingLeads } = await supabaseAdmin
      .from('outreach_leads')
      .select('website_url, email');

    const existingDomains = new Set<string>(
      (existingLeads || [])
        .map((l: { website_url: string }) => cleanDomain(l.website_url))
        .filter(Boolean)
    );

    const existingEmails = new Set<string>(
      (existingLeads || [])
        .map((l: { email?: string | null }) => l.email ? l.email.toLowerCase().trim() : '')
        .filter(Boolean)
    );

    // 3. Filter valid & deduplicate candidates (cap to 4 leads per request for Vercel Hobby survival)
    const MAX_HOBBY_BATCH = 4;
    const leadsInputSlice = leadsInput.slice(0, MAX_HOBBY_BATCH);

    let duplicatesSkipped = 0;
    const candidatesToProcess: Array<{
      websiteUrl: string;
      companyName?: string;
      founderName?: string;
      email?: string;
      linkedinUrl?: string;
      instagramUrl?: string;
      painPoint?: string;
      mr2Solution?: string;
      verifier?: string;
      isInvalid?: boolean;
      status?: string;
      websiteStatus?: string;
      reason?: string;
    }> = [];

    for (const lead of leadsInputSlice) {
      const email = lead.email ? lead.email.toLowerCase().trim() : null;
      let websiteUrl = lead.websiteUrl || lead.website_url;
      if (!websiteUrl && email && email.includes('@')) {
        websiteUrl = `https://${email.split('@')[1]}`;
      }

      if (!websiteUrl || typeof websiteUrl !== 'string') continue;
      const normalized = cleanDomain(websiteUrl);

      // Duplicate check against existing domains and emails
      if (existingDomains.has(normalized) || (email && existingEmails.has(email))) {
        duplicatesSkipped++;
        continue;
      }

      existingDomains.add(normalized); // Avoid intra-batch duplicates
      if (email) existingEmails.add(email);

      candidatesToProcess.push({
        websiteUrl,
        companyName: lead.companyName || lead.company_name,
        founderName: lead.founderName || lead.founder_name,
        email: email || undefined,
        linkedinUrl: lead.linkedinUrl || lead.linkedin_url,
        instagramUrl: lead.instagramUrl || lead.instagram_url,
        painPoint: lead.painPoint || lead.pain_point,
        mr2Solution: lead.mr2Solution || lead.mr2_solution,
        verifier: lead.verifier,
        isInvalid: lead.isInvalid || false,
        status: lead.status,
        websiteStatus: lead.websiteStatus,
        reason: lead.reason
      });
    }

    // 4. Sequential Processing & AI Pitch Generation with Vercel Hobby Timeout Guards
    let processed = 0;
    let successCount = 0;
    let rejectedByBouncer = 0;

    for (const target of candidatesToProcess) {
      processed++;
      console.log(`[CSV Import Processing ${processed}/${candidatesToProcess.length}] Evaluating: ${target.companyName || target.websiteUrl}`);

      let contactEmail = target.email;
      let phone: string | null = null;
      let domSnippet: string | undefined = undefined;

      // Determine Lead Status:
      // Valid leads get 'NEW'
      // Messed up leads get 'UNCONTACTABLE', 'INVALID_DOMAIN', 'MISSING_EMAIL', or 'REJECTED'
      let leadStatus: 'NEW' | 'UNCONTACTABLE' | 'INVALID_DOMAIN' | 'MISSING_EMAIL' | 'REJECTED' = 'NEW';
      if (target.isInvalid || target.status === 'UNCONTACTABLE' || target.status === 'BOUNCED') {
        leadStatus = 'UNCONTACTABLE';
      } else if (target.status === 'INVALID_DOMAIN' || target.websiteStatus === 'DEAD') {
        leadStatus = 'INVALID_DOMAIN';
      } else if (!contactEmail) {
        leadStatus = 'MISSING_EMAIL';
      } else if (target.status === 'REJECTED') {
        leadStatus = 'REJECTED';
      } else {
        leadStatus = 'NEW';
      }

      // Generate AI audit and personalized customer-POV pitch using custom pain point and Mr² Labs solution
      let emailSubject = `couldn't find your booking page`;
      let auditSummary = target.painPoint || `Customer POV Pitch for ${target.companyName || 'Company'}`;
      let generatedPitch = target.painPoint 
        ? `Hey ${target.founderName || 'there'},\n\nNoticed ${target.companyName} is dealing with: "${target.painPoint}". We built a dedicated solution (${target.mr2Solution || 'Mr² Labs AI System'}) to fix this automatically. Worth a 3-min chat?`
        : `Hey ${target.founderName || 'there'},\n\nCame across ${target.companyName} and saw friction in your online booking & inquiry triage. We help teams automate lead triage seamlessly. Worth a quick demo?`;

      // Only invoke LLM if lead is valid and under a 3.5s timeout to survive Vercel Hobby tier
      if (leadStatus === 'NEW') {
        try {
          const timeoutPromise = new Promise<{ error: boolean }>((res) => setTimeout(() => res({ error: true }), 3500));
          const aiCallPromise = generateAuditAndPitch(
            target.companyName || 'Company',
            target.websiteUrl,
            domSnippet,
            niche,
            {
              founderName: target.founderName,
              linkedinUrl: target.linkedinUrl,
              instagramUrl: target.instagramUrl,
              painPoint: target.painPoint,
              mr2Solution: target.mr2Solution
            }
          );

          const aiResult: any = await Promise.race([aiCallPromise, timeoutPromise]);

          if (!aiResult.error && aiResult.generated_pitch) {
            emailSubject = aiResult.email_subject || emailSubject;
            auditSummary = aiResult.audit_summary || auditSummary;
            generatedPitch = aiResult.generated_pitch;
          }
        } catch (aiErr) {
          console.warn('[CSV Import] AI Pitch fallback used:', aiErr);
        }
      }

      const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

      // Persist lead to Supabase
      const { error: insertErr } = await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignDbId,
        company_name: target.companyName || 'Company',
        website_url: target.websiteUrl,
        email: contactEmail || null,
        phone: phone || null,
        instagram_url: target.instagramUrl || null,
        linkedin_url: target.linkedinUrl || null,
        email_subject: emailSubject,
        audit_notes: auditSummary,
        pitch_text: generatedPitch,
        status: leadStatus,
        screenshot_url: screenshotUrl,
        raw_scraped_data: {
          founder_name: target.founderName || null,
          pain_point: target.painPoint || null,
          mr2_solution: target.mr2Solution || null,
          verifier: target.verifier || (leadStatus === 'NEW' ? 'Pre-Verified Inbox' : 'Unverified / Bounced'),
          enrichment_source: 'CSV_VERIFIED_IMPORT',
          verification_status: leadStatus,
          rejection_reason: target.reason || null
        }
      });

      if (!insertErr) {
        successCount++;
        console.log(`[CSV Import Success ${successCount}]: Saved ${target.companyName || target.websiteUrl} as ${leadStatus}`);
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
