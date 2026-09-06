-- ==============================================================================
-- MR² LABS OUTREACH ENGINE — COMPREHENSIVE MIGRATION (v1.0.0)
-- Phase 1 & 2: Data Trust Platform, Delivery & Reply Lifecycle, Evidence Ledger
-- Safe, additive migration preserving all existing data and backward compatibility.
-- ==============================================================================

-- 1. Extend lead_status ENUM with Data Trust & Delivery/Reply lifecycle states
DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'READY_TO_DRAFT';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'READY_TO_SEND';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'OPENED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'CLICKED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'BOUNCED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'STOP';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'UNSUBSCRIBED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add Data Trust & Real-Time Tracking columns to outreach_leads
ALTER TABLE outreach_leads
  -- Data Trust Layer: Raw vs Normalized vs Verified
  ADD COLUMN IF NOT EXISTS email_raw TEXT,
  ADD COLUMN IF NOT EXISTS email_normalized TEXT,
  ADD COLUMN IF NOT EXISTS email_verified TEXT,
  ADD COLUMN IF NOT EXISTS email_category TEXT DEFAULT 'GENERIC',
  ADD COLUMN IF NOT EXISTS deliverability_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS targeting_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opportunity_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sendability_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trust_pipeline_version TEXT DEFAULT 'v1.0.0',
  ADD COLUMN IF NOT EXISTS recommended_service TEXT,
  ADD COLUMN IF NOT EXISTS opportunity_rationale TEXT,
  ADD COLUMN IF NOT EXISTS do_not_pitch TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS claim_validation_status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS claim_validation_notes TEXT,
  ADD COLUMN IF NOT EXISTS founder_name TEXT,
  ADD COLUMN IF NOT EXISTS founder_role TEXT,
  ADD COLUMN IF NOT EXISTS founder_confidence INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS founder_source TEXT,
  
  -- Real-Time Email Delivery, Opens & Reply Tracking
  ADD COLUMN IF NOT EXISTS audit_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_open_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_status TEXT,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_snippet TEXT;

-- 3. Dedicated Lead Evidence Table (Decoupled from outreach_leads row)
CREATE TABLE IF NOT EXISTS lead_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'EMAIL', 'IDENTITY', 'CONTACT', 'LOCATION', 'FEATURE', 'SOCIAL'
    claim TEXT NOT NULL,    -- e.g. 'online_booking_present'
    value JSONB NOT NULL,   -- true | false | string | object
    confidence INT NOT NULL DEFAULT 100,
    source_type TEXT NOT NULL, -- 'OFFICIAL_WEBSITE', 'JSON_LD', 'SCRIPTAUDIT', 'DIRECTORY', 'LINKEDIN', 'DNS', 'USER_OVERRIDE'
    source_url TEXT,
    evidence_text TEXT,
    freshness_status TEXT DEFAULT 'FRESH', -- 'FRESH', 'STALE', 'EXPIRED'
    expires_at TIMESTAMPTZ,
    verification_version TEXT DEFAULT 'v1.0.0',
    verified_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_evidence_lead_id ON lead_evidence(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_evidence_category ON lead_evidence(category);
CREATE INDEX IF NOT EXISTS idx_lead_evidence_freshness ON lead_evidence(freshness_status);

-- 4. Dedicated Lead Conflicts Table (Decoupled from outreach_leads row)
CREATE TABLE IF NOT EXISTS lead_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
    conflict_type TEXT NOT NULL, -- 'LOCATION_MISMATCH', 'DOMAIN_MISMATCH', 'FOUNDER_MISMATCH', 'CLAIM_CONTRADICTION'
    severity TEXT NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH'
    values JSONB NOT NULL DEFAULT '[]',
    sources JSONB NOT NULL DEFAULT '[]',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_conflicts_lead_id ON lead_conflicts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_conflicts_resolved ON lead_conflicts(resolved);

-- 5. Dedicated Pipeline Runs & Idempotency Lock Table
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES outreach_leads(id) ON DELETE CASCADE,
    idempotency_key TEXT UNIQUE NOT NULL,
    pipeline_version TEXT NOT NULL DEFAULT 'v1.0.0',
    processing_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    errors JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_idempotency ON pipeline_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(processing_status);

-- 6. Suppression List (Global Opt-Outs & Bounces)
CREATE TABLE IF NOT EXISTS suppression_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    reason TEXT,
    opted_out_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppression_list_email ON suppression_list(email);
