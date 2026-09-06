import { AuditData } from './audit';
import { LeadEvidence, LeadConflict } from './evidence';

export type LeadStatus = 
  | 'NEW' 
  | 'READY_TO_DRAFT'
  | 'READY_TO_SEND'
  | 'NEEDS_REVIEW'
  | 'QUEUED' 
  | 'SENT' 
  | 'OPENED'
  | 'CLICKED'
  | 'REPLIED' 
  | 'BOUNCED'
  | 'STOP'
  | 'UNSUBSCRIBED'
  | 'MISSING_EMAIL' 
  | 'UNCONTACTABLE' 
  | 'INVALID_DOMAIN'
  | 'HOLD'
  | 'REJECTED';

export type EmailCategory = 
  | 'DECISION_MAKER'
  | 'BUSINESS'
  | 'GENERIC'
  | 'FREE'
  | 'PLACEHOLDER';

export type ClaimValidationStatus = 
  | 'PENDING' 
  | 'PASSED' 
  | 'FAILED' 
  | 'BYPASSED'
  | 'SKIPPED';

export type FounderSource = 
  | 'SCHEMA_JSON_LD'
  | 'ABOUT_PAGE'
  | 'LEGAL_PAGE'
  | 'NPI_REGISTRY'
  | 'SERP_FALLBACK'
  | 'NOT_FOUND';

export interface OutreachLead {
  id: string;
  campaign_id: string;
  company_name: string;
  website_url: string;
  
  // Standard contact fields (backwards-compatible)
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  email_subject?: string | null;

  // Decision Maker / Founder Discovery
  founder_name?: string | null;
  founder_role?: string | null;
  founder_confidence?: number | null;
  founder_source?: FounderSource | null;
  
  // Data Trust Layer: Raw vs Normalized vs Verified
  email_raw?: string | null;
  email_normalized?: string | null;
  email_verified?: string | null;
  email_category?: EmailCategory | null;
  
  // Multi-Dimensional Scorecard
  deliverability_score?: number | null;
  targeting_score?: number | null;
  identity_score?: number | null;
  opportunity_score?: number | null;
  sendability_score?: number | null;
  
  // Evidence & Auditing Metadata
  evidence_count?: number | null;
  last_verified_at?: string | null;
  trust_pipeline_version?: string | null;
  
  // Opportunity Engine & Strategy
  recommended_service?: string | null;
  opportunity_rationale?: string | null;
  do_not_pitch?: string[] | null;
  
  // Post-Draft Claim Validator
  claim_validation_status?: ClaimValidationStatus | null;
  claim_validation_notes?: string | null;
  
  // Legacy & Audit Details
  audit_data?: AuditData | null;
  raw_scraped_data?: Record<string, any> | string | null;
  audit_notes?: string | null;
  pitch_text?: string | null;
  verifier_used?: string | null;
  status: LeadStatus;
  screenshot_url?: string | null;
  sent_at?: string | null;
  scheduled_for?: string | null;
  follow_up_step?: number;
  last_contacted_at?: string | null;
  
  // Live Email Tracking & Reply Signals
  audit_open_count?: number | null;
  audit_opened_at?: string | null;
  reply_status?: 'POSITIVE' | 'STOP' | string | null;
  replied_at?: string | null;
  reply_snippet?: string | null;

  created_at: string;
  
  // Relational joins (optional when querying with relations)
  evidence?: LeadEvidence[];
  conflicts?: LeadConflict[];
}
