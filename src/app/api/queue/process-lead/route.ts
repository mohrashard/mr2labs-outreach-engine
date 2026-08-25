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

    // 1.5. Check daily quota before spending API credits
    let dailyLimit = 20;
    if (campaignId) {
      const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('daily_lead_limit')
        .eq('id', campaignId)
        .single();
      if (campaign?.daily_lead_limit) dailyLimit = campaign.daily_lead_limit;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count: createdToday } = await supabaseAdmin
      .from('outreach_leads')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .gte('created_at', startOfDay.toISOString());

    async function logEvent(type: string, msg: string, meta: any = {}) {
      try {
        await supabaseAdmin.from('system_logs').insert({ event_type: type, message: msg, metadata: meta });
      } catch (e) {
        console.error('Failed to log system event', e);
      }
    }

    if ((createdToday || 0) >= dailyLimit) {
      console.log(`[Background Worker] Quota met (${createdToday}/${dailyLimit}) for campaign: ${campaignId}. Skipping enrichment to save credits.`);
      await logEvent('QUOTA_MET', `Skipped ${target.websiteUrl} - Daily quota reached.`, { url: target.websiteUrl, campaignId });
      return NextResponse.json({ skipped: true, reason: 'QUOTA_MET' });
    }

    // 2. Deep enrich contact data via Waterfall (DOM -> Bouncer -> Serper Dork -> Hunter -> Apollo -> Snov)
    const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

    if (contactData.is_rejected) {
      console.log(`[Background Worker - Bouncer] Rejected: ${target.websiteUrl}`);
      await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignId || null,
        company_name: target.companyName,
        website_url: target.websiteUrl,
        status: 'REJECTED',
        audit_notes: 'Rejected by Niche Bouncer criteria.'
      });
      await logEvent('BOUNCER_REJECTED', `Rejected ${target.websiteUrl} - Bouncer validation failed.`, { url: target.websiteUrl });
      return NextResponse.json({ skipped: true, reason: 'REJECTED_BY_BOUNCER' });
    }

    if (!contactData.email) {
      console.log(`[Background Worker - Enrichment] No verified email found for: ${target.websiteUrl}`);
      await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignId || null,
        company_name: target.companyName,
        website_url: target.websiteUrl,
        status: 'REJECTED',
        audit_notes: 'No valid verified email found in pipeline.'
      });
      await logEvent('NO_EMAIL', `Skipped ${target.websiteUrl} - No valid email found.`, { url: target.websiteUrl });
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
        rawAuditData: contactData.raw_scraped_data
      }
    );

    const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

    if (aiResult.error) {
      console.log(`[Background Worker] Rejected: ${target.websiteUrl} - ${aiResult.error}`);
      await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignId || null,
        company_name: target.companyName,
        website_url: target.websiteUrl,
        status: 'REJECTED',
        audit_notes: aiResult.error
      });
      await logEvent('NO_FINDING', `Skipped ${target.websiteUrl} - ${aiResult.error}`, { url: target.websiteUrl });
      return NextResponse.json({ skipped: true, reason: 'NO_VERIFIED_FINDING' });
    }

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
        audit_notes: aiResult.audit_notes,
        pitch_text: aiResult.generated_pitch,
        status: 'NEW',
        screenshot_url: screenshotUrl,
        raw_scraped_data: { 
          snippet: target.snippet, 
          dom_snippet: contactData.dom_snippet,
          enrichment_source: contactData.enrichment_source,
          audit_data: contactData.raw_scraped_data
        }
      })
      .select('id')
      .single();

    if (insertError) {
      throw insertError;
    }

    const toolName = contactData.enrichment_source || 'Unknown';
    console.log(`[Background Worker Success] Created lead ID ${insertedLead.id} for ${target.websiteUrl} using ${toolName}`);
    await logEvent('SUCCESS', `Successfully scraped and verified ${target.websiteUrl} using Tool: ${toolName}`, { url: target.websiteUrl, email: contactData.email, tool: toolName, leadId: insertedLead.id });
    return NextResponse.json({ success: true, leadId: insertedLead.id });
  } catch (error: any) {
    console.error('[Background Worker Error]:', error);
    try {
      await supabaseAdmin.from('system_logs').insert({ event_type: 'ERROR', message: `Worker crashed: ${error.message}`, metadata: { error: error.message } });
    } catch (e) {}
    // Returning 500 status code triggers automatic QStash retry for failed jobs
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
