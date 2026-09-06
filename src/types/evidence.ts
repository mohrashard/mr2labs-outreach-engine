// ==============================================================================
// MR² LABS OUTREACH ENGINE — DATA TRUST & EVIDENCE LEDGER TYPES (v1.0.0)
// ==============================================================================

export type EvidenceCategory =
  | 'EMAIL'
  | 'IDENTITY'
  | 'CONTACT'
  | 'LOCATION'
  | 'FEATURE'
  | 'SOCIAL';

export type EvidenceSourceType =
  | 'OFFICIAL_WEBSITE'
  | 'JSON_LD'
  | 'SCRIPTAUDIT'
  | 'DIRECTORY'
  | 'LINKEDIN'
  | 'DNS'
  | 'USER_OVERRIDE';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'EXPIRED';

export interface LeadEvidence {
  id?: string;
  lead_id: string;
  category: EvidenceCategory;
  claim: string;             // e.g. 'online_booking_present', 'email_syntax_valid'
  value: any;                // true | false | string | object
  confidence: number;        // 0 - 100
  source_type: EvidenceSourceType;
  source_url?: string | null;
  evidence_text?: string | null; // e.g. "Found JaneApp booking link in navigation: https://glow.janeapp.com"
  freshness_status: FreshnessStatus;
  expires_at?: string | null;
  verification_version: string;
  verified_at: string;
  created_at?: string;
}

export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LeadConflict {
  id?: string;
  lead_id: string;
  conflict_type: 'LOCATION_MISMATCH' | 'DOMAIN_MISMATCH' | 'FOUNDER_MISMATCH' | 'CLAIM_CONTRADICTION';
  severity: ConflictSeverity;
  values: string[];
  sources: string[];
  resolved: boolean;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at?: string;
}

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface PipelineRun {
  id?: string;
  lead_id: string;
  idempotency_key: string;
  pipeline_version: string;
  processing_status: ProcessingStatus;
  started_at: string;
  completed_at?: string | null;
  errors?: Record<string, any> | null;
  created_at?: string;
}

export interface MultiDimensionalScores {
  deliverability_score: number; // 0 - 100 (DNS, MX, syntax, domain match)
  targeting_score: number;      // 0 - 100 (DECISION_MAKER vs BUSINESS vs GENERIC vs FREE)
  identity_score: number;       // 0 - 100 (Name, location, multi-location verification)
  opportunity_score: number;    // 0 - 100 (Feature gaps vs MR² solutions)
  sendability_score: number;    // 0 - 100 (Composite readiness)
}

export interface ClaimEvidenceMapping {
  claim_text: string;
  evidence_ids: string[];
  confidence: number;
}
