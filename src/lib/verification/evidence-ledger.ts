// ==============================================================================
// MR² LABS OUTREACH ENGINE — EVIDENCE LEDGER MANAGER & REPOSITORY (v1.0.0)
// ==============================================================================

import { LeadEvidence, FreshnessStatus } from '@/types/evidence';
import { SupabaseClient } from '@supabase/supabase-js';

export interface FormattedEvidenceSummary {
  leadId: string;
  totalClaims: number;
  freshClaims: number;
  staleClaims: number;
  expiredClaims: number;
  lastVerifiedAt: string | null;
  features: Record<string, { present: boolean; evidence: string; confidence: number }>;
  email: {
    syntaxValid: boolean;
    domainMatch: boolean;
    mxValid: boolean;
    targetingCategory?: string;
  };
  location: {
    verified: boolean;
    multiLocation: boolean;
    details?: string;
  };
}

/**
 * Evaluates and updates the freshness status of evidence based on expiration dates.
 */
export function evaluateEvidenceFreshness(evidence: LeadEvidence): FreshnessStatus {
  if (!evidence.expires_at) return 'FRESH';
  const expires = new Date(evidence.expires_at).getTime();
  const now = Date.now();
  
  if (now > expires) {
    return 'EXPIRED';
  }

  // If within 7 days of expiration, mark as STALE
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (expires - now < sevenDaysMs) {
    return 'STALE';
  }

  return 'FRESH';
}

/**
 * Filters out expired claims to ensure decisions use only fresh facts.
 */
export function filterFreshEvidence(evidenceList: LeadEvidence[]): LeadEvidence[] {
  return evidenceList.map((ev) => ({
    ...ev,
    freshness_status: evaluateEvidenceFreshness(ev),
  })).filter((ev) => ev.freshness_status !== 'EXPIRED');
}

/**
 * Persists an array of LeadEvidence records into Supabase `lead_evidence` table.
 */
export async function persistEvidenceBatch(
  supabaseAdmin: SupabaseClient,
  leadId: string,
  evidenceList: LeadEvidence[]
): Promise<{ count: number; error?: string }> {
  if (!evidenceList || evidenceList.length === 0) return { count: 0 };

  try {
    const payload = evidenceList.map((e) => ({
      lead_id: leadId,
      category: e.category,
      claim: e.claim,
      value: typeof e.value === 'object' ? e.value : JSON.stringify(e.value),
      confidence: e.confidence,
      source_type: e.source_type,
      source_url: e.source_url || null,
      evidence_text: e.evidence_text || null,
      freshness_status: evaluateEvidenceFreshness(e),
      expires_at: e.expires_at || null,
      verification_version: e.verification_version || 'v1.0.0',
      verified_at: e.verified_at || new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin.from('lead_evidence').insert(payload);
    if (error) {
      console.error('[Evidence Ledger] Failed to persist evidence batch:', error.message);
      return { count: 0, error: error.message };
    }

    // Update evidence_count and last_verified_at on outreach_leads
    await supabaseAdmin.from('outreach_leads').update({
      evidence_count: evidenceList.length,
      last_verified_at: new Date().toISOString(),
    }).eq('id', leadId);

    return { count: payload.length };
  } catch (err: any) {
    console.error('[Evidence Ledger Crash]:', err.message);
    return { count: 0, error: err.message };
  }
}

/**
 * Formats raw evidence records into a structured summary for the Admin QA Drawer.
 */
export function formatEvidenceForDrawer(evidenceList: LeadEvidence[]): FormattedEvidenceSummary {
  const summary: FormattedEvidenceSummary = {
    leadId: evidenceList[0]?.lead_id || '',
    totalClaims: evidenceList.length,
    freshClaims: 0,
    staleClaims: 0,
    expiredClaims: 0,
    lastVerifiedAt: null,
    features: {},
    email: {
      syntaxValid: false,
      domainMatch: false,
      mxValid: false,
    },
    location: {
      verified: false,
      multiLocation: false,
    },
  };

  for (const ev of evidenceList) {
    const freshness = evaluateEvidenceFreshness(ev);
    if (freshness === 'FRESH') summary.freshClaims++;
    else if (freshness === 'STALE') summary.staleClaims++;
    else summary.expiredClaims++;

    if (!summary.lastVerifiedAt || new Date(ev.verified_at) > new Date(summary.lastVerifiedAt)) {
      summary.lastVerifiedAt = ev.verified_at;
    }

    // Parse Feature claims
    if (ev.category === 'FEATURE') {
      const isPresent = Boolean(ev.value === true || ev.value === 'true');
      summary.features[ev.claim] = {
        present: isPresent,
        evidence: ev.evidence_text || '',
        confidence: ev.confidence,
      };
    }

    // Parse Email claims
    if (ev.category === 'EMAIL') {
      if (ev.claim === 'email_syntax_valid') summary.email.syntaxValid = Boolean(ev.value);
      if (ev.claim === 'email_matches_business_domain') summary.email.domainMatch = Boolean(ev.value);
      if (ev.claim === 'email_mx_valid') summary.email.mxValid = Boolean(ev.value);
      if (ev.claim === 'email_targeting_category') summary.email.targetingCategory = String(ev.value);
    }

    // Parse Location claims
    if (ev.category === 'LOCATION') {
      if (ev.claim === 'location_verified') {
        summary.location.verified = true;
        summary.location.details = ev.evidence_text || undefined;
      }
      if (ev.claim === 'multi_location_detected') {
        summary.location.multiLocation = true;
        summary.location.details = ev.evidence_text || undefined;
      }
    }
  }

  return summary;
}
