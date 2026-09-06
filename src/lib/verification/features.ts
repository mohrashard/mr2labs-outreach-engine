// ==============================================================================
// MR² LABS OUTREACH ENGINE — FEATURE EVIDENCE SCANNER & REGISTRY (v1.0.0)
// ==============================================================================

import * as cheerio from 'cheerio';
import { LeadEvidence } from '@/types/evidence';

export type FeatureStatus = 'CONFIRMED_PRESENT' | 'NOT_FOUND' | 'UNKNOWN';

export interface FeatureCheckResult {
  status: FeatureStatus;
  provider?: string | null;
  evidenceText?: string | null;
  confidence: number;
}

export interface VerifiedFeaturesMap {
  onlineBooking: FeatureCheckResult;
  liveChat: FeatureCheckResult;
  whatsapp: FeatureCheckResult;
  patientPortal: FeatureCheckResult;
  contactForm: FeatureCheckResult;
  evidence: LeadEvidence[];
}

interface ProviderSignature {
  name: string;
  patterns: RegExp[];
}

// 1. Scheduling / Online Booking Signatures (URL, Script, Iframe & Data Attribute matching)
const SCHEDULING_PROVIDERS: ProviderSignature[] = [
  { name: 'JaneApp', patterns: [/janeapp\.com/i, /jane\.app/i, /data-jane-app/i, /data-jane/i, /jane-embed/i] },
  { name: 'Calendly', patterns: [/calendly\.com/i, /assets\.calendly\.com/i, /data-calendly/i] },
  { name: 'Mindbody', patterns: [/mindbodyonline\.com/i, /healcode\.com/i, /widgets\.mindbodyonline/i, /data-mindbody/i] },
  { name: 'Acuity Scheduling', patterns: [/acuityscheduling\.com/i, /squarespacescheduling\.com/i, /data-acuity/i] },
  { name: 'Vagaro', patterns: [/vagaro\.com/i, /widgets\.vagaro\.com/i, /data-vagaro/i, /vagaro-embed/i] },
  { name: 'Boulevard', patterns: [/joinblvd\.com/i, /blvd\.app/i, /data-blvd/i] },
  { name: 'Phorest', patterns: [/phorest\.com/i, /data-phorest/i] },
  { name: 'Zenoti', patterns: [/zenoti\.com/i, /data-zenoti/i] },
  { name: 'Booksy', patterns: [/booksy\.com/i, /data-booksy/i] },
  { name: 'Zocdoc', patterns: [/zocdoc\.com/i, /data-zocdoc/i] },
  { name: 'Nextech Booking', patterns: [/nextech\.com/i] },
];

// 2. Live Chat / Conversational Assistant Signatures
const CHAT_PROVIDERS: ProviderSignature[] = [
  { name: 'Tidio', patterns: [/code\.tidio\.co/i, /tidio\.com/i] },
  { name: 'Crisp', patterns: [/client\.crisp\.chat/i, /crisp\.chat/i] },
  { name: 'Intercom', patterns: [/widget\.intercom\.io/i, /intercom\.com/i] },
  { name: 'Drift', patterns: [/js\.driftt\.com/i, /drift\.com/i] },
  { name: 'Zendesk Chat', patterns: [/static\.zdassets\.com/i, /zopim\.com/i] },
  { name: 'LiveChat', patterns: [/cdn\.livechatinc\.com/i] },
  { name: 'HubSpot Chat', patterns: [/js\.hs-scripts\.com/i, /hubspot\.com\/conversations/i] },
  { name: 'Podium', patterns: [/podium\.com/i, /connect\.podium\.com/i] },
];

// 3. Patient Portal Signatures
const PORTAL_PROVIDERS: ProviderSignature[] = [
  { name: 'Nextech Patient Portal', patterns: [/nextech\.com.*portal/i, /patientportal.*nextech/i] },
  { name: 'Symplast', patterns: [/symplast\.com/i] },
  { name: 'PatientNow', patterns: [/patientnow\.com/i, /myhealthportal/i] },
  { name: 'Kareo', patterns: [/kareo\.com.*portal/i, /patientportal.*kareo/i] },
  { name: 'CharmHealth', patterns: [/charmhealth\.com/i] },
  { name: 'AthenaHealth', patterns: [/athenahealth\.com/i] },
  { name: 'WebPT', patterns: [/webpt\.com/i] },
];

/**
 * Scans raw HTML for verified feature evidence (Booking, Chat, WhatsApp, Portals, Forms).
 * Emits auditable LeadEvidence nodes with freshness and expiration metadata.
 */
export function scanBusinessFeatures(
  htmlContent: string,
  sourceUrl: string,
  leadId: string = 'temp'
): VerifiedFeaturesMap {
  const $ = cheerio.load(htmlContent);
  const evidence: LeadEvidence[] = [];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days freshness

  const rawHtml = htmlContent.toLowerCase();

  // --------------------------------------------------------------------------
  // 1. Online Booking / Scheduling Check
  // --------------------------------------------------------------------------
  let onlineBooking: FeatureCheckResult = {
    status: 'NOT_FOUND',
    provider: null,
    evidenceText: null,
    confidence: 85,
  };

  for (const provider of SCHEDULING_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (pattern.test(rawHtml)) {
        onlineBooking = {
          status: 'CONFIRMED_PRESENT',
          provider: provider.name,
          evidenceText: `Detected ${provider.name} scheduling script/link matching ${pattern.source}`,
          confidence: 98,
        };
        break;
      }
    }
    if (onlineBooking.status === 'CONFIRMED_PRESENT') break;
  }

  // Also inspect anchor links and interactive buttons for explicit booking text / modal triggers
  if (onlineBooking.status !== 'CONFIRMED_PRESENT') {
    const bookingElement = $('a, button, [role="button"], input[type="button"]').filter((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const href = $(el).attr('href') || '';
      const onclick = $(el).attr('onclick') || '';
      const id = $(el).attr('id') || '';
      const className = $(el).attr('class') || '';

      const matchesBookingText = (
        text.includes('book online') ||
        text.includes('schedule appointment') ||
        text.includes('book consultation') ||
        text.includes('book appointment now') ||
        text.includes('schedule online') ||
        text.includes('book an appointment') ||
        text.includes('schedule your visit')
      );

      const matchesModalCode = (
        onclick.toLowerCase().includes('schedul') ||
        onclick.toLowerCase().includes('book') ||
        id.toLowerCase().includes('book') ||
        id.toLowerCase().includes('schedul') ||
        className.toLowerCase().includes('booking')
      );

      return (
        (matchesBookingText || matchesModalCode) &&
        !href.startsWith('tel:') &&
        !href.startsWith('mailto:')
      );
    }).first();

    if (bookingElement.length > 0) {
      const href = bookingElement.attr('href') || bookingElement.attr('onclick') || 'interactive modal button';
      const text = bookingElement.text().trim() || bookingElement.attr('value') || 'Booking Button';
      onlineBooking = {
        status: 'CONFIRMED_PRESENT',
        provider: 'Custom Web Scheduler',
        evidenceText: `Detected booking CTA / modal trigger: "${text}" (${href})`,
        confidence: 90,
      };
    }
  }

  evidence.push({
    lead_id: leadId,
    category: 'FEATURE',
    claim: 'online_booking_present',
    value: onlineBooking.status === 'CONFIRMED_PRESENT',
    confidence: onlineBooking.confidence,
    source_type: 'SCRIPTAUDIT',
    source_url: sourceUrl,
    evidence_text: onlineBooking.evidenceText || 'No online booking or scheduling widget found on page',
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // --------------------------------------------------------------------------
  // 2. Live Chat / Conversational Widget Check
  // --------------------------------------------------------------------------
  let liveChat: FeatureCheckResult = {
    status: 'NOT_FOUND',
    provider: null,
    evidenceText: null,
    confidence: 85,
  };

  for (const provider of CHAT_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (pattern.test(rawHtml)) {
        liveChat = {
          status: 'CONFIRMED_PRESENT',
          provider: provider.name,
          evidenceText: `Detected active ${provider.name} conversational widget script`,
          confidence: 98,
        };
        break;
      }
    }
    if (liveChat.status === 'CONFIRMED_PRESENT') break;
  }

  evidence.push({
    lead_id: leadId,
    category: 'FEATURE',
    claim: 'live_chat_present',
    value: liveChat.status === 'CONFIRMED_PRESENT',
    confidence: liveChat.confidence,
    source_type: 'SCRIPTAUDIT',
    source_url: sourceUrl,
    evidence_text: liveChat.evidenceText || 'No live chat or interactive website assistant detected',
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // --------------------------------------------------------------------------
  // 3. WhatsApp Direct Integration Check
  // --------------------------------------------------------------------------
  let whatsapp: FeatureCheckResult = {
    status: 'NOT_FOUND',
    provider: null,
    evidenceText: null,
    confidence: 85,
  };

  const whatsappLink = $('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href^="whatsapp://"]').first();
  if (whatsappLink.length > 0) {
    const href = whatsappLink.attr('href');
    whatsapp = {
      status: 'CONFIRMED_PRESENT',
      provider: 'WhatsApp Direct',
      evidenceText: `Detected direct WhatsApp engagement button/link: ${href}`,
      confidence: 95,
    };
  }

  evidence.push({
    lead_id: leadId,
    category: 'FEATURE',
    claim: 'whatsapp_integration_present',
    value: whatsapp.status === 'CONFIRMED_PRESENT',
    confidence: whatsapp.confidence,
    source_type: 'OFFICIAL_WEBSITE',
    source_url: sourceUrl,
    evidence_text: whatsapp.evidenceText || 'No direct WhatsApp click-to-chat button detected',
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // --------------------------------------------------------------------------
  // 4. Patient Portal Check
  // --------------------------------------------------------------------------
  let patientPortal: FeatureCheckResult = {
    status: 'NOT_FOUND',
    provider: null,
    evidenceText: null,
    confidence: 80,
  };

  for (const provider of PORTAL_PROVIDERS) {
    for (const pattern of provider.patterns) {
      if (pattern.test(rawHtml)) {
        patientPortal = {
          status: 'CONFIRMED_PRESENT',
          provider: provider.name,
          evidenceText: `Detected ${provider.name} integration link/script`,
          confidence: 90,
        };
        break;
      }
    }
    if (patientPortal.status === 'CONFIRMED_PRESENT') break;
  }

  // Also check for "Patient Portal" links in nav
  if (patientPortal.status !== 'CONFIRMED_PRESENT') {
    const portalLink = $('a').filter((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      return text.includes('patient portal') || text.includes('my portal') || text.includes('client portal');
    }).first();

    if (portalLink.length > 0) {
      patientPortal = {
        status: 'CONFIRMED_PRESENT',
        provider: 'Custom Portal',
        evidenceText: `Detected portal navigation link: "${portalLink.text().trim()}" (${portalLink.attr('href')})`,
        confidence: 85,
      };
    }
  }

  evidence.push({
    lead_id: leadId,
    category: 'FEATURE',
    claim: 'patient_portal_present',
    value: patientPortal.status === 'CONFIRMED_PRESENT',
    confidence: patientPortal.confidence,
    source_type: 'OFFICIAL_WEBSITE',
    source_url: sourceUrl,
    evidence_text: patientPortal.evidenceText || 'No dedicated patient or client portal link detected',
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  // --------------------------------------------------------------------------
  // 5. Contact / Lead Capture Form Check
  // --------------------------------------------------------------------------
  let contactForm: FeatureCheckResult = {
    status: 'NOT_FOUND',
    provider: null,
    evidenceText: null,
    confidence: 80,
  };

  const forms = $('form');
  let hasContactInput = false;
  forms.each((_, el) => {
    const inputs = $(el).find('input[type="email"], input[type="tel"], textarea');
    if (inputs.length > 0) {
      hasContactInput = true;
      return false; // break
    }
  });

  if (hasContactInput) {
    contactForm = {
      status: 'CONFIRMED_PRESENT',
      provider: 'Standard Web Form',
      evidenceText: 'Detected active web contact/inquiry form with email/phone inputs',
      confidence: 90,
    };
  }

  evidence.push({
    lead_id: leadId,
    category: 'FEATURE',
    claim: 'contact_form_present',
    value: contactForm.status === 'CONFIRMED_PRESENT',
    confidence: contactForm.confidence,
    source_type: 'OFFICIAL_WEBSITE',
    source_url: sourceUrl,
    evidence_text: contactForm.evidenceText || 'No interactive inquiry form found on page',
    freshness_status: 'FRESH',
    expires_at: expiresAt,
    verification_version: 'v1.0.0',
    verified_at: now,
  });

  return {
    onlineBooking,
    liveChat,
    whatsapp,
    patientPortal,
    contactForm,
    evidence,
  };
}
