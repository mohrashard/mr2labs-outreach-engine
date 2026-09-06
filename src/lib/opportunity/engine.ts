// ==============================================================================
// MR² LABS OUTREACH ENGINE — OPPORTUNITY ENGINE & STRATEGIC MATRIX (v1.0.0)
// ==============================================================================

import { VerifiedFeaturesMap } from '@/lib/verification/features';
import { LeadEvidence } from '@/types/evidence';

export type OpportunityType =
  | 'AI_WEBSITE_CONCIERGE'
  | 'AI_BOOKING_ASSISTANT'
  | 'AI_WHATSAPP_RECOVERY'
  | 'PATIENT_PORTAL_AUTOMATION'
  | 'CUSTOM_INTELLIGENCE_SYSTEM'
  | 'NO_CLEAR_OPPORTUNITY';

export interface OpportunityResult {
  opportunityType: OpportunityType;
  recommendedService: string;
  opportunityRationale: string;
  opportunityScore: number; // 0 - 100
  supportingEvidenceIds: string[];
  doNotPitch: string[];
  forbiddenClaims: string[];
  evidence: LeadEvidence[];
}

/**
 * Deterministically maps verified website features and gaps into MR² Labs strategic solutions.
 * Produces explicit 'doNotPitch' and 'forbiddenClaims' lists to bind the AI writer to verified facts.
 */
export function identifyOpportunity(
  features: VerifiedFeaturesMap,
  niche: string = 'Medical Spa',
  leadId: string = 'temp'
): OpportunityResult {
  const supportingEvidenceIds: string[] = [];
  const doNotPitch: string[] = [];
  const forbiddenClaims: string[] = [];
  const generatedEvidence: LeadEvidence[] = [];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const hasBooking = features.onlineBooking.status === 'CONFIRMED_PRESENT';
  const hasChat = features.liveChat.status === 'CONFIRMED_PRESENT';
  const hasWhatsApp = features.whatsapp.status === 'CONFIRMED_PRESENT';
  const hasPortal = features.patientPortal.status === 'CONFIRMED_PRESENT';
  const hasForm = features.contactForm.status === 'CONFIRMED_PRESENT';

  // Harvest relevant evidence IDs from the feature scanner
  for (const ev of features.evidence) {
    if (ev.id) supportingEvidenceIds.push(ev.id);
  }

  // --------------------------------------------------------------------------
  // RULE 1: Online Booking is CONFIRMED, but Live Chat is NOT FOUND
  // (The "TAJ Aesthetics" case)
  // --------------------------------------------------------------------------
  if (hasBooking && !hasChat) {
    const bookingProvider = features.onlineBooking.provider || 'online scheduler';
    doNotPitch.push('Online Booking', 'Online Scheduling', 'Booking Calendar', 'Basic Appointment Widget');
    forbiddenClaims.push(
      "You don't have online booking",
      'Your website lacks an appointment scheduler',
      'Patients cannot book appointments online',
      'No online booking option available'
    );

    const recommendedService = 'AI Website Concierge & Patient Pre-Qualifier';
    const opportunityRationale = `The clinic already uses an active scheduling system (${bookingProvider}), but prospective patients researching high-ticket treatments drop off if clinical questions aren't answered instantly before booking. An AI concierge answers pre-treatment questions 24/7 and guides qualified patients directly into their existing ${bookingProvider} calendar.`;

    generatedEvidence.push({
      lead_id: leadId,
      category: 'FEATURE',
      claim: 'recommended_opportunity',
      value: { type: 'AI_WEBSITE_CONCIERGE', target: recommendedService },
      confidence: 95,
      source_type: 'SCRIPTAUDIT',
      evidence_text: `Identified AI Website Concierge opportunity: active ${bookingProvider} detected without live pre-consultation chat`,
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });

    return {
      opportunityType: 'AI_WEBSITE_CONCIERGE',
      recommendedService,
      opportunityRationale,
      opportunityScore: 95,
      supportingEvidenceIds,
      doNotPitch,
      forbiddenClaims,
      evidence: generatedEvidence,
    };
  }

  // --------------------------------------------------------------------------
  // RULE 2: Online Booking is NOT FOUND, but Contact Form is CONFIRMED
  // (The "Traditional Practice" case)
  // --------------------------------------------------------------------------
  if (!hasBooking && hasForm) {
    doNotPitch.push('Contact Form', 'Website Redesign', 'Email Inbox Setup');
    forbiddenClaims.push(
      "You don't have a contact form",
      'There is no way to contact the clinic',
      'Your site has no lead capture form'
    );

    const recommendedService = 'Automated 24/7 Appointment Booking Assistant';
    const opportunityRationale = 'Visitors currently have to submit a static contact form and wait for business hours for a manual callback. An automated booking assistant converts after-hours traffic into confirmed consultation slots instantly.';

    generatedEvidence.push({
      lead_id: leadId,
      category: 'FEATURE',
      claim: 'recommended_opportunity',
      value: { type: 'AI_BOOKING_ASSISTANT', target: recommendedService },
      confidence: 90,
      source_type: 'OFFICIAL_WEBSITE',
      evidence_text: 'Identified Automated Booking Assistant opportunity: static web form present without real-time booking',
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });

    return {
      opportunityType: 'AI_BOOKING_ASSISTANT',
      recommendedService,
      opportunityRationale,
      opportunityScore: 90,
      supportingEvidenceIds,
      doNotPitch,
      forbiddenClaims,
      evidence: generatedEvidence,
    };
  }

  // --------------------------------------------------------------------------
  // RULE 3: Online Booking is CONFIRMED, Chat is CONFIRMED, but WhatsApp is NOT FOUND
  // (The "Mobile Re-engagement" case)
  // --------------------------------------------------------------------------
  if (hasBooking && hasChat && !hasWhatsApp) {
    doNotPitch.push('Online Booking', 'Live Chat Widget', 'Website Concierge');
    forbiddenClaims.push(
      "You don't have online booking",
      'Your website lacks live chat',
      'No interactive web assistant'
    );

    const recommendedService = 'WhatsApp Patient Recovery & Lead Re-engagement Bot';
    const opportunityRationale = 'The clinic has strong on-site booking and chat, but loses prospective patients who browse on mobile and bounce before completing their booking. An automated WhatsApp recovery sequence re-engages abandoned inquiries.';

    generatedEvidence.push({
      lead_id: leadId,
      category: 'FEATURE',
      claim: 'recommended_opportunity',
      value: { type: 'AI_WHATSAPP_RECOVERY', target: recommendedService },
      confidence: 85,
      source_type: 'OFFICIAL_WEBSITE',
      evidence_text: 'Identified WhatsApp Recovery opportunity: on-site chat and booking confirmed without mobile WhatsApp re-engagement',
      freshness_status: 'FRESH',
      expires_at: expiresAt,
      verification_version: 'v1.0.0',
      verified_at: now,
    });

    return {
      opportunityType: 'AI_WHATSAPP_RECOVERY',
      recommendedService,
      opportunityRationale,
      opportunityScore: 85,
      supportingEvidenceIds,
      doNotPitch,
      forbiddenClaims,
      evidence: generatedEvidence,
    };
  }

  // --------------------------------------------------------------------------
  // RULE 4: Full Stack Detected (Booking + Chat + WhatsApp all present)
  // --------------------------------------------------------------------------
  if (hasBooking && hasChat && hasWhatsApp) {
    doNotPitch.push('Online Booking', 'Live Chat Widget', 'WhatsApp Button', 'Contact Form');
    forbiddenClaims.push(
      "You don't have online booking",
      'Your website lacks chat',
      'You have no WhatsApp link'
    );

    const recommendedService = 'Custom EHR & Patient Intake AI Integration';
    const opportunityRationale = 'The clinic already has an advanced conversational and booking frontend. The high-leverage opportunity is backend patient intake automation: synchronizing patient pre-consultation data directly into their clinical EHR.';

    return {
      opportunityType: 'CUSTOM_INTELLIGENCE_SYSTEM',
      recommendedService,
      opportunityRationale,
      opportunityScore: 75,
      supportingEvidenceIds,
      doNotPitch,
      forbiddenClaims,
      evidence: generatedEvidence,
    };
  }

  // --------------------------------------------------------------------------
  // DEFAULT / FALLBACK: General Digital Patient Experience Optimization
  // --------------------------------------------------------------------------
  return {
    opportunityType: 'AI_BOOKING_ASSISTANT',
    recommendedService: 'Automated 24/7 Patient Booking & Inbound Assistant',
    opportunityRationale: 'Friction in after-hours patient acquisition leads to treatment inquiries dropping off to competitors.',
    opportunityScore: 70,
    supportingEvidenceIds,
    doNotPitch: [],
    forbiddenClaims: [],
    evidence: generatedEvidence,
  };
}
