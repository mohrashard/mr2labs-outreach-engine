-- Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    niche TEXT NOT NULL,
    location TEXT NOT NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach Leads Status Enum
DO $$ BEGIN
    CREATE TYPE lead_status AS ENUM (
        'NEW', 
        'QUEUED', 
        'SENT', 
        'REPLIED', 
        'MISSING_EMAIL', 
        'UNCONTACTABLE', 
        'INVALID_DOMAIN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Outreach Leads Table
CREATE TABLE IF NOT EXISTS outreach_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    website_url TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    whatsapp TEXT,
    instagram_url TEXT,
    linkedin_url TEXT,
    email_subject TEXT,
    raw_scraped_data JSONB,
    audit_notes TEXT,
    pitch_text TEXT,
    status lead_status DEFAULT 'NEW',
    screenshot_url TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES outreach_leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS email_subject TEXT;

CREATE TABLE IF NOT EXISTS pitch_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niche_name TEXT UNIQUE NOT NULL,
    pain_points TEXT NOT NULL,
    mr2_solution TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);


BEGIN;

-- 1. Add follow-up tracking columns to outreach_leads
ALTER TABLE outreach_leads 
  ADD COLUMN IF NOT EXISTS follow_up_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- 2. Add performance index for follow-up cron jobs
CREATE INDEX IF NOT EXISTS idx_outreach_leads_status_step 
  ON outreach_leads(status, follow_up_step);

-- 3. Add UNIQUE constraint to prevent duplicate prospecting
DO $$ 
BEGIN
    ALTER TABLE outreach_leads ADD CONSTRAINT unique_website_url UNIQUE (website_url);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
    WHEN unique_violation THEN 
        RAISE NOTICE 'Could not add unique constraint due to existing duplicate URLs.';
    WHEN others THEN 
        RAISE NOTICE 'An error occurred adding the unique constraint.';
END $$;

-- 4. Add dynamic daily limit configuration to campaigns
ALTER TABLE campaigns 
  ADD COLUMN IF NOT EXISTS daily_lead_limit INT DEFAULT 20;

COMMIT;

