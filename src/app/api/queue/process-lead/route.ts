export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deepEnrichDomain } from '@/lib/scraper/enrichment';
import { generateAuditAndPitch } from '@/lib/ai/pitch';
import { verifyEmailQuality } from '@/lib/verification/email-quality';
import { verifyBusinessIdentity } from '@/lib/verification/business-identity';
import { scanBusinessFeatures } from '@/lib/verification/features';
import { evaluateConflicts } from '@/lib/verification/conflicts';
import { identifyOpportunity } from '@/lib/opportunity/engine';
import { calculateSendability } from '@/lib/verification/sendability';
import { persistEvidenceBatch } from '@/lib/verification/evidence-ledger';
import { buildPitchGuardContext } from '@/lib/ai/pitch-guard';

const PIPELINE_VERSION = 'v1.0.0';

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

    // ------------------------------------------------------------------------
    // 1. Idempotency Lock Check (Prevents duplicate work on QStash retries)
    // ------------------------------------------------------------------------
    const idempotencyKey = `${target.websiteUrl.toLowerCase().trim()}:${campaignId || 'default'}:${PIPELINE_VERSION}`;
    const { data: existingRun } = await supabaseAdmin
      .from('pipeline_runs')
      .select('id, processing_status, lead_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingRun && existingRun.processing_status === 'COMPLETED') {
      console.log(`[Idempotency Guard] Skipping: Job ${idempotencyKey} already completed.`);
      return NextResponse.json({ skipped: true, reason: 'IDEMPOTENT_ALREADY_COMPLETED', leadId: existingRun.lead_id });
    }

    // Insert or update pipeline run to PROCESSING
    if (!existingRun) {
      await supabaseAdmin.from('pipeline_runs').insert({
        idempotency_key: idempotencyKey,
        pipeline_version: PIPELINE_VERSION,
        processing_status: 'PROCESSING',
        started_at: new Date().toISOString(),
      });
    }

    // 1.1 Deduplicate against existing leads
    const { data: existingLead } = await supabaseAdmin
      .from('outreach_leads')
      .select('id')
      .eq('website_url', target.websiteUrl)
      .maybeSingle();

    if (existingLead) {
      console.log(`[Background Worker] Lead already exists: ${target.websiteUrl}`);
      await supabaseAdmin.from('pipeline_runs').update({
        processing_status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        lead_id: existingLead.id,
      }).eq('idempotency_key', idempotencyKey);

      return NextResponse.json({ skipped: true, reason: 'ALREADY_EXISTS', leadId: existingLead.id });
    }

    // 1.2 Check daily quota before spending API credits
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
    startOfDay.setUTCHours(0, 0, 0, 0);

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
      console.log(`[Background Worker] Quota met (${createdToday}/${dailyLimit}) for campaign: ${campaignId}. Skipping enrichment.`);
      await logEvent('QUOTA_MET', `Skipped ${target.websiteUrl} - Daily quota reached.`, { url: target.websiteUrl, campaignId });
      return NextResponse.json({ skipped: true, reason: 'QUOTA_MET' });
    }

    // ------------------------------------------------------------------------
    // 2. Raw Enrichment: Fast DOM Scrape & Contact Discovery
    // ------------------------------------------------------------------------
    const contactData = await deepEnrichDomain(target.websiteUrl, target.companyName, niche);

    if (contactData.is_rejected) {
      console.log(`[Background Worker - Bouncer] Rejected: ${target.websiteUrl}`);
      const { data: rejLead } = await supabaseAdmin.from('outreach_leads').insert({
        campaign_id: campaignId || null,
        company_name: target.companyName,
        website_url: target.websiteUrl,
        status: 'REJECTED',
        audit_notes: 'Rejected by Niche Bouncer criteria.'
      }).select('id').single();

      await supabaseAdmin.from('pipeline_runs').update({
        processing_status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        lead_id: rejLead?.id,
      }).eq('idempotency_key', idempotencyKey);

      await logEvent('BOUNCER_REJECTED', `Rejected ${target.websiteUrl} - Bouncer validation failed.`, { url: target.websiteUrl });
      return NextResponse.json({ skipped: true, reason: 'REJECTED_BY_BOUNCER' });
    }

    // ------------------------------------------------------------------------
    // 3. Deterministic Data Trust Pipeline
    // ------------------------------------------------------------------------
    const rawEmail = contactData.email || '';
    const domHtml = contactData.dom_snippet || '';

    // Step A: Email Quality & Deliverability Verification
    const emailResult = await verifyEmailQuality(rawEmail, target.websiteUrl);

    // Step B: Business Identity, Multi-Location & Location Consistency
    const identityResult = verifyBusinessIdentity(
      domHtml,
      { city: target.city, state: target.state },
      target.companyName,
      contactData.instagram_url,
      contactData.linkedin_url
    );

    // Step C: Feature Evidence Scanner (JaneApp, Mindbody, Tidio, WhatsApp, etc.)
    const featuresResult = scanBusinessFeatures(domHtml, target.websiteUrl);

    // Step D: Conflict Engine Evaluation
    const combinedConflicts = [...identityResult.conflicts];
    if (!emailResult.matchesBusinessDomain && !emailResult.isFreeProvider && emailResult.syntaxValid) {
      combinedConflicts.push({
        lead_id: 'temp',
        conflict_type: 'DOMAIN_MISMATCH',
        severity: 'MEDIUM',
        values: [emailResult.normalizedEmail, target.websiteUrl],
        sources: ['Scraped Email', 'Target Website'],
        resolved: false,
        resolution_notes: 'Email domain differs from company website root domain.',
        created_at: new Date().toISOString(),
      });
    }
    const conflictResult = evaluateConflicts(combinedConflicts);

    // Step E: Strategic Opportunity Matrix (doNotPitch & forbiddenClaims generation)
    const opportunityResult = identifyOpportunity(featuresResult, niche);

    // Step F: Sendability Decision & Composite Scoring
    const sendabilityDecision = calculateSendability({
      emailResult,
      identityResult,
      opportunityResult,
      conflictResult,
    });

    console.log(`[Data Trust Result] ${target.websiteUrl} -> Score: ${sendabilityDecision.sendabilityScore}/100 | Status: ${sendabilityDecision.status}`);

    const screenshotUrl = `https://api.microlink.io?url=${encodeURIComponent(target.websiteUrl)}&screenshot=true`;

    // ------------------------------------------------------------------------
    // 4. Persistence: Write Lead with Verified Trust Data
    // ------------------------------------------------------------------------
    const { data: insertedLead, error: insertError } = await supabaseAdmin
      .from('outreach_leads')
      .insert({
        campaign_id: campaignId || null,
        company_name: identityResult.companyName,
        website_url: target.websiteUrl,
        email: emailResult.normalizedEmail || null,
        email_raw: rawEmail || null,
        email_normalized: emailResult.normalizedEmail || null,
        email_verified: emailResult.status === 'VERIFIED' ? emailResult.normalizedEmail : null,
        email_category: emailResult.emailCategory,
        phone: identityResult.phone || contactData.phone || null,
        whatsapp: featuresResult.whatsapp.status === 'CONFIRMED_PRESENT' ? (contactData.whatsapp || 'CONFIRMED') : null,
        instagram_url: identityResult.cleanedInstagramUrl,
        linkedin_url: identityResult.cleanedLinkedinUrl,
        founder_name: contactData.contact_name || null,
        founder_role: contactData.contact_role || null,
        founder_confidence: contactData.contact_confidence || 0,
        founder_source: contactData.contact_source || null,
        deliverability_score: emailResult.deliverabilityScore,
        targeting_score: emailResult.targetingScore,
        identity_score: identityResult.identityScore,
        opportunity_score: opportunityResult.opportunityScore,
        sendability_score: sendabilityDecision.sendabilityScore,
        recommended_service: opportunityResult.recommendedService,
        opportunity_rationale: opportunityResult.opportunityRationale,
        do_not_pitch: opportunityResult.doNotPitch,
        status: sendabilityDecision.status,
        screenshot_url: screenshotUrl,
        audit_notes: sendabilityDecision.decisionReason,
        trust_pipeline_version: PIPELINE_VERSION,
        raw_scraped_data: {
          dom_snippet: contactData.dom_snippet,
          enrichment_source: contactData.enrichment_source,
          verifier_used: contactData.verifier_used,
          hard_blockers: sendabilityDecision.hardBlockers,
          score_breakdown: sendabilityDecision.scoreBreakdown,
        },
      })
      .select('id')
      .single();

    if (insertError || !insertedLead) {
      throw insertError || new Error('Failed to insert lead');
    }

    const leadId = insertedLead.id;

    // ------------------------------------------------------------------------
    // 5. Relational Ledger Persistence: Evidence & Conflicts
    // ------------------------------------------------------------------------
    const allEvidence = [
      ...emailResult.evidence,
      ...identityResult.evidence,
      ...featuresResult.evidence,
      ...opportunityResult.evidence,
    ].map((ev) => ({ ...ev, lead_id: leadId }));

    if (contactData.contact_name) {
      allEvidence.push({
        lead_id: leadId,
        category: 'IDENTITY',
        claim: 'founder_identified',
        value: {
          name: contactData.contact_name,
          role: contactData.contact_role,
        },
        confidence: contactData.contact_confidence || 85,
        source_type: contactData.contact_source === 'NPI_REGISTRY' ? 'DIRECTORY' : 'OFFICIAL_WEBSITE',
        evidence_text: `Discovered decision maker: ${contactData.contact_name} (${contactData.contact_role || 'Owner'}) via ${contactData.contact_source}`,
        freshness_status: 'FRESH',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        verification_version: PIPELINE_VERSION,
        verified_at: new Date().toISOString(),
      });
    }

    await persistEvidenceBatch(supabaseAdmin, leadId, allEvidence);

    if (combinedConflicts.length > 0) {
      const conflictPayload = combinedConflicts.map((c) => ({
        lead_id: leadId,
        conflict_type: c.conflict_type,
        severity: c.severity,
        values: c.values,
        sources: c.sources,
        resolved: c.resolved,
        resolution_notes: c.resolution_notes || null,
      }));
      await supabaseAdmin.from('lead_conflicts').insert(conflictPayload);
    }

    // ------------------------------------------------------------------------
    // 6. AI Drafting Gate (Only if status is READY_TO_DRAFT)
    // ------------------------------------------------------------------------
    if (sendabilityDecision.isReadyForDraft) {
      console.log(`[AI Drafting Gate] Lead ${leadId} passed Trust Gate. Proceeding to SDR pitch generation...`);
      
      const aiResult = await generateAuditAndPitch(
        identityResult.companyName,
        target.websiteUrl,
        contactData.dom_snippet,
        niche,
        {
          founderName: contactData.contact_name,
          founderConfidence: contactData.contact_confidence,
          linkedinUrl: identityResult.cleanedLinkedinUrl,
          instagramUrl: identityResult.cleanedInstagramUrl,
          rawAuditData: contactData.raw_scraped_data,
          pitchGuardContext: buildPitchGuardContext(opportunityResult, featuresResult, allEvidence),
          verifiedFeatures: featuresResult,
        }
      );

      if (aiResult && !aiResult.error && aiResult.claim_validation_status !== 'FAILED') {
        await supabaseAdmin.from('outreach_leads').update({
          email_subject: aiResult.email_subject,
          pitch_text: aiResult.generated_pitch,
          status: 'READY_TO_SEND',
          claim_validation_status: 'PASSED',
          claim_validation_notes: aiResult.claim_validation_notes || 'All claims verified against Evidence Ledger',
        }).eq('id', leadId);
      } else {
        console.warn(`[AI Drafting Gate] Pitch generation or claim validation failed for lead ${leadId}: ${aiResult?.error || aiResult?.claim_validation_notes}`);
        await supabaseAdmin.from('outreach_leads').update({
          status: 'NEEDS_REVIEW',
          claim_validation_status: 'FAILED',
          claim_validation_notes: aiResult?.claim_validation_notes || aiResult?.error || 'Claim validation contradiction caught',
        }).eq('id', leadId);

        if (aiResult?.claim_validation_status === 'FAILED') {
          await supabaseAdmin.from('lead_conflicts').insert({
            lead_id: leadId,
            conflict_type: 'CLAIM_CONTRADICTION',
            severity: 'HIGH',
            values: [aiResult?.claim_validation_notes || 'Claim contradiction detected'],
            sources: ['POST_GENERATION_CLAIM_VALIDATOR'],
            resolved: false,
          });
        }
      }
    } else {
      console.log(`[AI Drafting Gate] Lead ${leadId} routed to ${sendabilityDecision.status}: ${sendabilityDecision.decisionReason}`);
    }

    // ------------------------------------------------------------------------
    // 7. Mark Pipeline Run Completed
    // ------------------------------------------------------------------------
    await supabaseAdmin.from('pipeline_runs').update({
      processing_status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      lead_id: leadId,
    }).eq('idempotency_key', idempotencyKey);

    await logEvent('TRUST_PIPELINE_COMPLETE', `Processed ${target.websiteUrl} -> ${sendabilityDecision.status} (Score: ${sendabilityDecision.sendabilityScore})`, {
      leadId,
      status: sendabilityDecision.status,
      score: sendabilityDecision.sendabilityScore,
    });

    return NextResponse.json({
      success: true,
      leadId,
      status: sendabilityDecision.status,
      sendabilityScore: sendabilityDecision.sendabilityScore,
      decisionReason: sendabilityDecision.decisionReason,
    });

  } catch (error: any) {
    console.error('[Background Worker Error]:', error);
    try {
      await supabaseAdmin.from('system_logs').insert({
        event_type: 'ERROR',
        message: `Trust Worker crashed: ${error.message}`,
        metadata: { error: error.message },
      });
    } catch (e) {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
