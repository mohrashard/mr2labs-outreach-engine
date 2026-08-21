import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    })
  : null;

export const maxDuration = 60; // 60 seconds max per single lead processing worker

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();

    // Verify QStash signature strictly if signing keys are present
    if (receiver) {
      const signature = request.headers.get('upstash-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing QStash signature' }, { status: 401 });
      }

      const isValid = await receiver.verify({
        signature,
        body: bodyText,
      }).catch((err) => {
        console.error('[Queue Process Lead] QStash verification failed:', err);
        return false;
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[Queue Process Lead] Warning: QStash signing keys are missing in production environment!');
    }

    const payload = JSON.parse(bodyText);
    const { target, campaignId, niche } = payload;

    if (!target || !target.websiteUrl) {
      return NextResponse.json({ error: 'Missing target websiteUrl in payload' }, { status: 400 });
    }

    console.log(`[Background Worker] Processing lead: ${target.websiteUrl} for campaign: ${campaignId || 'default'}`);

    // 1. Deduplicate against database
    const { data: existing } = await supabaseAdmin
      .from('outreach_leads')
      .select('id')
      .eq('website_url', target.websiteUrl)
      .maybeSingle();

    if (existing) {
      console.log(`[Background Worker] Lead already exists: ${target.websiteUrl}`);
      return NextResponse.json({ skipped: true, reason: 'ALREADY_EXISTS', leadId: existing.id });
    }

    // 2. Deep enrich contact data via Waterfall (DOM -> Bouncer -> Serper Dork -> Hunter -> Apollo -> Snov)
    const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

    if (contactData.is_rejected) {
      console.log(`[Background Worker - Bouncer] Rejected: ${target.websiteUrl}`);
      return NextResponse.json({ skipped: true, reason: 'REJECTED_BY_BOUNCER' });
    }

    if (!contactData.email) {
      console.log(`[Background Worker - Enrichment] No verified email found for: ${target.websiteUrl}`);
      return NextResponse.json({ skipped: true, reason: 'NO_VERIFIED_EMAIL' });
    }

    // 3. Generate AI audit, pitch, and email subject line using Niche Matrix
    const aiResult = await generateAuditAndPitch(
      target.companyName,
      target.websiteUrl,
      contactData.dom_snippet,
      niche,
      {
        linkedinUrl: contactData.linkedin_url,
        instagramUrl: contactData.instagram_url,
      }
    );

    const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

    // 4. Persist to Supabase
    const { data: insertedLead, error: insertError } = await supabaseAdmin
      .from('outreach_leads')
      .insert({
        campaign_id: campaignId || null,
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
      })
      .select('id')
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log(`[Background Worker Success] Created lead ID ${insertedLead.id} for ${target.websiteUrl}`);
    return NextResponse.json({ success: true, leadId: insertedLead.id });
  } catch (error: any) {
    console.error('[Background Worker Error]:', error);
    // Returning 500 status code triggers automatic QStash retry for failed jobs
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
