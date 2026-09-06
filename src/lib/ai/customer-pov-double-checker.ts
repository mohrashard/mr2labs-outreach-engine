// ==============================================================================
// MR² LABS OUTREACH ENGINE — CUSTOMER POV PITCH & DOUBLE-CHECKER TEMPLATE SYSTEM
// ==============================================================================

import { VerifiedFeaturesMap } from '@/lib/verification/features';
import { sanitizeGreetingAndBody } from '@/lib/email/formatter';

export interface CustomerPOVValidationResult {
  isValid: boolean;
  notes: string[];
  repairedPitch?: string;
  repairedSubject?: string;
}

export type CustomerPOVProblem = 
  | 'MISSING_BOOKING'
  | 'FORM_FRICTION'
  | 'AFTER_HOURS_CONTACT'
  | 'MOBILE_FRICTION'
  | 'GENERAL_LEAD_CONVERSION';

export const CUSTOMER_POV_FOOTER = `**If you'd prefer not to hear from me, reply "stop" and I'll remove you immediately, but if you want improve your business and need my free breakdown reply "yes".**`;

/**
 * Pre-Made Canonical Customer POV Templates.
 * Flips the dynamic from vendor to confused customer who tried to buy/book and experienced real friction.
 * STRICT RULE: ZERO EM DASHES (—) ANYWHERE IN SUBJECT OR BODY.
 */
export function generatePreMadeCustomerPOVPitch(
  companyName: string,
  founderName?: string | null,
  nicheInput: string = 'business',
  problemType: CustomerPOVProblem = 'MISSING_BOOKING',
  options?: { founderConfidence?: number }
): { email_subject: string; email_body: string; audit_finding: string; business_impact: string; recommended_service: string } {
  // 1. Sanitize company name - strip legal suffixes and ensure clean conversational name
  let cleanCompany = companyName
    ? companyName.trim().replace(/[,.]?\s*\b(llc|inc|corp|corporation|ltd|co|pc|pllc|group|holdings)\b\.?/gi, '').replace(/[,.]\s*$/, '').trim()
    : 'your team';
  if (!cleanCompany || cleanCompany.length < 2) cleanCompany = 'your team';

  // 2. Resolve niche plural / conversational term
  const nicheLower = nicheInput.toLowerCase();
  let nichePlural = 'businesses';
  if (nicheLower.includes('medspa') || nicheLower.includes('aesthetic')) nichePlural = 'medspas';
  else if (nicheLower.includes('dental') || nicheLower.includes('dentist')) nichePlural = 'dental clinics';
  else if (nicheLower.includes('clinic') || nicheLower.includes('health') || nicheLower.includes('doctor')) nichePlural = 'private clinics';
  else if (nicheLower.includes('law') || nicheLower.includes('legal') || nicheLower.includes('attorney')) nichePlural = 'law firms';
  else if (nicheLower.includes('real estate') || nicheLower.includes('realt') || nicheLower.includes('broker')) nichePlural = 'real estate agencies';
  else if (nicheLower.includes('trade') || nicheLower.includes('plumb') || nicheLower.includes('hvac') || nicheLower.includes('electric') || nicheLower.includes('roof')) nichePlural = 'home service companies';
  else if (nicheLower.includes('agency') || nicheLower.includes('marketing')) nichePlural = 'digital agencies';
  else if (nicheLower.includes('saas') || nicheLower.includes('software')) nichePlural = 'tech companies';

  // 3. Resolve Greeting
  let greetingName = 'team';
  const confidence = options?.founderConfidence ?? (founderName ? 85 : 0);
  if (founderName && founderName.trim() && confidence >= 75) {
    const raw = founderName.trim().replace(/^(dr\.|mr\.|mrs\.|ms\.)\s+/i, '').split(' ')[0];
    if (raw && !['unknown', 'admin', 'contact', 'info', 'sales', 'support', 'team', 'none', 'null'].includes(raw.toLowerCase())) {
      greetingName = /^dr\.?\s+/i.test(founderName.trim()) ? `Dr. ${raw}` : raw;
    }
  }

  const greetingLine = greetingName !== 'team' ? `Hi ${greetingName},` : `Hi ${cleanCompany} team,`;

  // 4. Generate by verified problem type (Strictly 0 em-dashes)
  if (problemType === 'MISSING_BOOKING') {
    const email_subject = cleanCompany !== 'your team' && cleanCompany.length <= 18
      ? `question about booking at ${cleanCompany}`
      : `couldn't find your booking page`;

    const email_body = `${greetingLine}

I was trying to book an appointment at ${cleanCompany} tonight but couldn't find a way to do it online after hours, ended up leaving without booking.

Not sure if that's intentional or something worth fixing on your end.

I actually build automated booking systems for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically.

Want me to send it over?

Best,
Rashard

${CUSTOMER_POV_FOOTER}`;

    return {
      email_subject,
      email_body,
      audit_finding: 'No after-hours online booking system found',
      business_impact: 'Leads arriving after business hours drop off without self-scheduling',
      recommended_service: 'Automated 24/7 Booking Assistant'
    };
  }

  if (problemType === 'AFTER_HOURS_CONTACT') {
    const email_subject = cleanCompany !== 'your team' && cleanCompany.length <= 18
      ? `quick question for ${cleanCompany}`
      : `couldn't reach anyone after hours`;

    const email_body = `${greetingLine}

Tried reaching someone at ${cleanCompany} earlier with a quick question before booking, but couldn't get a response after hours.

Figured I'd email directly in case that's a known issue.

I actually build automated inquiry response systems for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically.

Want me to send it over?

Best,
Rashard

${CUSTOMER_POV_FOOTER}`;

    return {
      email_subject,
      email_body,
      audit_finding: 'No after-hours live response or WhatsApp concierge detected',
      business_impact: 'Prospective clients with immediate buying questions leave without answers',
      recommended_service: '24/7 AI Inquiry Concierge'
    };
  }

  // Default: FORM_FRICTION or GENERAL_LEAD_CONVERSION
  const email_subject = cleanCompany !== 'your team' && cleanCompany.length <= 18
    ? `is your contact form working at ${cleanCompany}`
    : `is your contact form working`;

  const email_body = `${greetingLine}

Tried submitting an inquiry on ${cleanCompany} earlier but it kept hanging up on my phone, wasn't sure if it went through.

Wanted to flag it in case the form isn't working properly on mobile.

I actually build lead response systems for ${nichePlural}. I already put together a quick 2-minute Loom breakdown of what I'd do for ${cleanCompany} specifically.

Want me to send it over?

Best,
Rashard

${CUSTOMER_POV_FOOTER}`;

  return {
    email_subject,
    email_body,
    audit_finding: 'Contact and inquiry forms experience mobile friction',
    business_impact: 'High-intent mobile visitors abandon inquiries when forms hang or fail to auto-confirm',
    recommended_service: 'Instant Lead Capture & Intake System'
  };
}

/**
 * DOUBLE CHECKER: Validates any AI-generated pitch against the strict Customer POV rules.
 * If the AI drifted into vendor speak, included domain names, used em-dashes in subjects,
 * or mentioned PDFs, it rejects or synthesizes the pre-made template.
 */
export function doubleCheckCustomerPOVPitch(
  subject: string,
  body: string,
  companyName: string,
  domain: string,
  verifiedFeatures?: VerifiedFeaturesMap,
  nicheInput?: string,
  founderName?: string | null,
  founderConfidence?: number
): CustomerPOVValidationResult {
  const notes: string[] = [];
  let isCompliant = true;

  // 1. Check Subject for Em-Dashes (Strict Rule: NO em-dashes in subject)
  let cleanSubject = subject.trim();
  if (/—|--|–/.test(cleanSubject)) {
    notes.push('Subject contained em-dash (—, –, or --). Stripped.');
    cleanSubject = cleanSubject.replace(/\s*(?:—|--|–)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 2. Check Subject for spam/vendor triggers
  const lowerSubject = cleanSubject.toLowerCase();
  const vendorSubjectWords = ['audit', 'proposal', 'partnership', 'solution', 'service', 'free analysis', 'optimization'];
  if (vendorSubjectWords.some(w => lowerSubject.includes(w))) {
    notes.push('Subject used vendor buzzwords instead of conversational customer perspective.');
    isCompliant = false;
  }

  // 3. Check Body for Domains / URLs (Strict Rule: DO NOT mention domains or links)
  const domainPattern = new RegExp(`\\b${domain.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(?:com|co|io|net|org|us|biz|ai)\b/i;
  
  let cleanBody = body;
  if (domainPattern.test(cleanBody) || urlPattern.test(cleanBody)) {
    notes.push(`Body contained web domain or URL instead of clean company name "${companyName}". Sanitized.`);
    cleanBody = cleanBody
      .replace(domainPattern, companyName)
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/www\.[^\s]+/gi, '');
  }

  // 4. Check Body for Em-Dashes (Strict Rule: NO em-dashes inside the body)
  if (/—|–/.test(cleanBody)) {
    notes.push('Body contained em-dash or en-dash. Replaced with clean punctuation.');
    cleanBody = cleanBody.replace(/\s*[—–]\s*/g, ', ');
  }

  // 5. Check for Customer Perspective Opener (Must feel like a real customer trying to buy/book)
  const customerOpenerRegex = /\b(was trying to|tried to|tried submitting|tried reaching|tried filling|tried booking|was looking to book|wanted to book|ended up leaving)\b/i;
  if (!customerOpenerRegex.test(cleanBody)) {
    notes.push('Body failed Customer POV check: Did not open as a customer experiencing friction.');
    isCompliant = false;
  }

  // 6. Check for Vendor Talking Down / Stale Audits (BANNED: PDF audit, "noticed your site has an issue")
  const vendorPhrases = [
    /\bi noticed your (website|site) (has|lacks|is missing)/i,
    /\bi ran a (quick )?(audit|check|scan)/i,
    /\bpdf (audit|report|breakdown)/i,
    /\bwe are an? (agency|firm|software company)/i,
    /\bdiagnostic report\b/i
  ];
  for (const vp of vendorPhrases) {
    if (vp.test(cleanBody)) {
      notes.push(`Body contained banned vendor phrase: "${vp.source}".`);
      isCompliant = false;
    }
  }

  // 7. Check for Loom Video Mention (Must offer quick 2-minute Loom breakdown)
  const loomRegex = /\b(loom|video)\s*(breakdown|teardown|walkthrough)?\b/i;
  if (!loomRegex.test(cleanBody)) {
    notes.push('Body did not mention a 2-minute Loom breakdown.');
    // Replace any generic "diagnostic" or "audit" with "2-minute Loom breakdown"
    cleanBody = cleanBody.replace(/\b(2-minute\s+)?(diagnostic|audit|breakdown)\b/gi, '2-minute Loom breakdown');
  }

  // 8. Check Ground Truth vs Verified Features (Anti-Hallucination Firewall)
  if (verifiedFeatures) {
    if (verifiedFeatures.onlineBooking.status === 'CONFIRMED_PRESENT') {
      if (/couldn'?t find (your |a )?booking|no way to book online|leaving without booking/i.test(cleanBody)) {
        notes.push('CONTRADICTION: Claimed missing booking, but online booking is confirmed present on page.');
        isCompliant = false;
      }
    }
  }

  // 9. Enforce Dual-Action Opt-Out & Free Breakdown Footer (Bold, clean without raw dashes)
  const footerRegex = /(?:[-—–_]{2,}\s*\n?)?(?:\*\*)?If you'd prefer not to hear from me[\s\S]*$/i;
  if (footerRegex.test(cleanBody)) {
    cleanBody = cleanBody.replace(footerRegex, CUSTOMER_POV_FOOTER).trim();
  } else if (!cleanBody.includes('need my free breakdown reply "yes"')) {
    cleanBody = `${cleanBody.trim()}\n\n${CUSTOMER_POV_FOOTER}`;
  }

  // 10. If non-compliant, synthesize the verified Pre-Made Customer POV Template
  if (!isCompliant) {
    let problem: CustomerPOVProblem = 'MISSING_BOOKING';
    if (verifiedFeatures && verifiedFeatures.onlineBooking.status === 'CONFIRMED_PRESENT') {
      problem = verifiedFeatures.liveChat.status === 'NOT_FOUND' ? 'AFTER_HOURS_CONTACT' : 'FORM_FRICTION';
    }

    const preMade = generatePreMadeCustomerPOVPitch(
      companyName,
      founderName,
      nicheInput,
      problem,
      { founderConfidence }
    );

    return {
      isValid: true,
      notes: [...notes, 'Auto-repaired using verified Customer POV Pre-Made Template.'],
      repairedSubject: preMade.email_subject,
      repairedPitch: preMade.email_body
    };
  }

  // Final pass: enforce absolute zero em-dashes and remove stray dash lines
  cleanSubject = cleanSubject.replace(/[—–]|--/g, ' ').replace(/\s+/g, ' ').trim();
  cleanBody = cleanBody.replace(/\s*[—–]\s*/g, ', ');
  cleanBody = cleanBody.replace(/\n\s*[-—–_]{2,}\s*\n/g, '\n\n').replace(/\n\s*[-—–_]{2,}\s*$/g, '');

  return {
    isValid: true,
    notes: notes.length > 0 ? notes : ['Double-check passed: 100% compliant Customer POV.'],
    repairedSubject: cleanSubject,
    repairedPitch: cleanBody
  };
}
