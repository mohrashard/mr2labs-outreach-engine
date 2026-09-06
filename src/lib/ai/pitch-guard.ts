// ==============================================================================
// MR² LABS OUTREACH ENGINE — PITCH GUARD PRE-PROMPT COMPOSER (v1.0.0)
// ==============================================================================

import { OpportunityResult } from '@/lib/opportunity/engine';
import { VerifiedFeaturesMap } from '@/lib/verification/features';
import { LeadEvidence } from '@/types/evidence';

export interface PitchGuardContext {
  verifiedFacts: string[];
  recommendedService: string;
  opportunityRationale: string;
  doNotPitch: string[];
  forbiddenClaims: string[];
  evidenceIds: string[];
}

/**
 * Builds the Pitch Guard context from verified features and strategic opportunities.
 */
export function buildPitchGuardContext(
  opportunity: OpportunityResult,
  features: VerifiedFeaturesMap,
  evidenceList: LeadEvidence[] = []
): PitchGuardContext {
  const verifiedFacts: string[] = [];

  // 1. Record verified capabilities
  if (features.onlineBooking.status === 'CONFIRMED_PRESENT') {
    const provider = features.onlineBooking.provider || 'an active online scheduler';
    verifiedFacts.push(`The business already uses ${provider} for appointment booking.`);
  }

  if (features.liveChat.status === 'CONFIRMED_PRESENT') {
    const provider = features.liveChat.provider || 'live chat';
    verifiedFacts.push(`The business already has active conversational software (${provider}).`);
  } else {
    verifiedFacts.push('The business does NOT have a live chat or AI pre-qualification concierge on their website.');
  }

  if (features.whatsapp.status === 'CONFIRMED_PRESENT') {
    verifiedFacts.push('The business has a direct WhatsApp contact link.');
  }

  if (features.patientPortal.status === 'CONFIRMED_PRESENT') {
    const provider = features.patientPortal.provider || 'a dedicated patient portal';
    verifiedFacts.push(`The business already provides ${provider}.`);
  }

  if (features.contactForm.status === 'CONFIRMED_PRESENT') {
    verifiedFacts.push('The business has a standard inquiry contact form.');
  }

  const evidenceIds = evidenceList.map((e) => e.id).filter(Boolean) as string[];

  return {
    verifiedFacts,
    recommendedService: opportunity.recommendedService,
    opportunityRationale: opportunity.opportunityRationale,
    doNotPitch: opportunity.doNotPitch,
    forbiddenClaims: opportunity.forbiddenClaims,
    evidenceIds,
  };
}

/**
 * Formats the Pitch Guard instructions into system prompt text.
 */
export function formatPitchGuardPrompt(guard: PitchGuardContext): string {
  const factsList = guard.verifiedFacts.map((f) => `  - ${f}`).join('\n');
  const doNotPitchList = guard.doNotPitch.length > 0
    ? guard.doNotPitch.map((d) => `  - ${d}`).join('\n')
    : '  - None';
  const forbiddenList = guard.forbiddenClaims.length > 0
    ? guard.forbiddenClaims.map((c) => `  - "${c}"`).join('\n')
    : '  - None';

  return `
================================================================================
CRITICAL PITCH GUARD & TRUTH CONSTRAINTS (STRICT COMPLIANCE REQUIRED):
================================================================================
You MUST adhere to these verified empirical facts. Any contradiction will cause
the email draft to fail automated compliance and be immediately rejected.

VERIFIED FACTS ABOUT THIS BUSINESS:
${factsList}

RECOMMENDED SOLUTION TO PITCH:
  - Solution: ${guard.recommendedService}
  - Value Context: ${guard.opportunityRationale}

STRICT 'DO NOT PITCH' LIST (They already have this or it is off-target):
${doNotPitchList}

STRICT FORBIDDEN CLAIMS (DO NOT say or imply any of the following):
${forbiddenList}
================================================================================
`;
}
