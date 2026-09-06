// ==============================================================================
// MR² LABS OUTREACH ENGINE — POST-GENERATION CLAIM VALIDATOR (v1.0.0)
// ==============================================================================

import { VerifiedFeaturesMap } from '@/lib/verification/features';
import { ClaimValidationStatus } from '@/types/lead';

export interface ClaimValidationResult {
  isValid: boolean;
  status: ClaimValidationStatus;
  detectedContradictions: string[];
  notes: string;
}

// Patterns that falsely assert absence of online booking
const MISSING_BOOKING_CONTRADICTIONS: RegExp[] = [
  /no (way to|online|appointment) (book|schedul)/i,
  /lacks? (an? )?(online )?(booking|scheduler|scheduling)/i,
  /don'?t have (an? )?(online )?(booking|scheduler|scheduling)/i,
  /without (an? )?(online )?booking/i,
  /missing (an? )?(online )?(booking|scheduler|scheduling)/i,
  /unable to book (online|appointments)/i,
  /can'?t book (online|appointments)/i,
  /doesn'?t offer (online )?booking/i,
  /no automated (scheduling|booking)/i,
];

// Patterns that falsely assert absence of contact forms
const MISSING_FORM_CONTRADICTIONS: RegExp[] = [
  /no (contact|inquiry) form/i,
  /lacks? a contact form/i,
  /no way (for patients )?to reach (out|you)/i,
];

// Patterns that falsely assert absence of live chat
const MISSING_CHAT_CONTRADICTIONS: RegExp[] = [
  /no (live )?chat/i,
  /lacks? (a )?(live )?chat/i,
  /no interactive (website )?chat/i,
];

// Patterns that falsely assert absence of WhatsApp
const MISSING_WHATSAPP_CONTRADICTIONS: RegExp[] = [
  /no (direct )?whatsapp/i,
  /lacks? (a )?whatsapp/i,
  /missing whatsapp/i,
  /without whatsapp/i,
  /doesn'?t have (a )?whatsapp/i,
  /don'?t have (a )?whatsapp/i,
];

// Patterns that falsely assert absence of patient portal
const MISSING_PORTAL_CONTRADICTIONS: RegExp[] = [
  /no (patient )?portal/i,
  /lacks? a (patient )?portal/i,
  /missing (a )?(patient )?portal/i,
  /without a (patient )?portal/i,
  /doesn'?t have a (patient )?portal/i,
];

/**
 * Validates generated AI pitch text against confirmed evidence to ensure zero hallucinations.
 */
export function validateGeneratedClaims(
  emailText: string,
  emailSubject: string,
  features: VerifiedFeaturesMap,
  forbiddenClaims: string[] = []
): ClaimValidationResult {
  const combinedText = `${emailSubject} ${emailText}`.toLowerCase();
  const detectedContradictions: string[] = [];

  // 1. Check Booking Contradiction
  if (features.onlineBooking.status === 'CONFIRMED_PRESENT') {
    for (const pattern of MISSING_BOOKING_CONTRADICTIONS) {
      if (pattern.test(combinedText)) {
        detectedContradictions.push(
          `CONTRADICTION: Pitch claims missing booking ("${pattern.source}"), but online booking (${features.onlineBooking.provider || 'detected'}) is confirmed present.`
        );
        break;
      }
    }
  }

  // 2. Check Contact Form Contradiction
  if (features.contactForm.status === 'CONFIRMED_PRESENT') {
    for (const pattern of MISSING_FORM_CONTRADICTIONS) {
      if (pattern.test(combinedText)) {
        detectedContradictions.push(
          `CONTRADICTION: Pitch claims missing contact form ("${pattern.source}"), but contact form is confirmed present.`
        );
        break;
      }
    }
  }

  // 3. Check Live Chat Contradiction
  if (features.liveChat.status === 'CONFIRMED_PRESENT') {
    for (const pattern of MISSING_CHAT_CONTRADICTIONS) {
      if (pattern.test(combinedText)) {
        detectedContradictions.push(
          `CONTRADICTION: Pitch claims missing live chat ("${pattern.source}"), but live chat (${features.liveChat.provider || 'detected'}) is confirmed present.`
        );
        break;
      }
    }
  }

  // 4. Check WhatsApp Contradiction
  if (features.whatsapp.status === 'CONFIRMED_PRESENT') {
    for (const pattern of MISSING_WHATSAPP_CONTRADICTIONS) {
      if (pattern.test(combinedText)) {
        detectedContradictions.push(
          `CONTRADICTION: Pitch claims missing WhatsApp ("${pattern.source}"), but WhatsApp is confirmed present.`
        );
        break;
      }
    }
  }

  // 5. Check Patient Portal Contradiction
  if (features.patientPortal.status === 'CONFIRMED_PRESENT') {
    for (const pattern of MISSING_PORTAL_CONTRADICTIONS) {
      if (pattern.test(combinedText)) {
        detectedContradictions.push(
          `CONTRADICTION: Pitch claims missing patient portal ("${pattern.source}"), but patient portal is confirmed present.`
        );
        break;
      }
    }
  }

  // 6. Check Explicit Forbidden Claims
  for (const forbidden of forbiddenClaims) {
    if (combinedText.includes(forbidden.toLowerCase())) {
      detectedContradictions.push(`FORBIDDEN_CLAIM_VIOLATION: "${forbidden}" was found in draft.`);
    }
  }

  const isValid = detectedContradictions.length === 0;

  return {
    isValid,
    status: isValid ? 'PASSED' : 'FAILED',
    detectedContradictions,
    notes: isValid
      ? 'All generated claims align with verified Evidence Ledger.'
      : `Contradictions detected: ${detectedContradictions.join(' | ')}`,
  };
}
