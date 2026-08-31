-- ==============================================================================
-- MR² LABS - STARTUP & MVP ENGINE DATABASE MIGRATION
-- Creates isolated 'startup_campaigns' and 'startup_leads' tables.
-- Runs independently of legacy 'outreach_leads' and 'campaigns' tables.
-- ==============================================================================

-- 1. Create Startup Campaigns Table
CREATE TABLE IF NOT EXISTS startup_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_niche TEXT DEFAULT 'Full-Stack MVP & Mobile Apps',
  source TEXT DEFAULT 'HN_INTENT', -- 'HN_INTENT', 'YC_FUNDED', 'PRODUCT_HUNT'
  yc_batch TEXT DEFAULT 'W24',    -- e.g. 'W24', 'S24', 'W25'
  daily_lead_limit INT DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Startup Leads Table
CREATE TABLE IF NOT EXISTS startup_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES startup_campaigns(id) ON DELETE SET NULL,
  
  -- Company & Founder Profile
  company_name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  founder_name TEXT,
  founder_title TEXT DEFAULT 'Founder & CEO',
  
  -- Contact Vectors
  work_email TEXT,
  phone TEXT,
  whatsapp TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  twitter_url TEXT,
  
  -- Intent Signals & Tech Stack
  source_type TEXT DEFAULT 'HN_INTENT', -- 'HN_INTENT', 'YC_FUNDED', 'PRODUCT_HUNT'
  yc_batch TEXT,
  tech_stack TEXT[] DEFAULT '{}',        -- e.g. ['React Native', 'Next.js', 'Node.js', 'Python']
  intent_snippet TEXT,                   -- Raw post/comment text showing hiring/MVP intent
  
  -- AI Generated Pitch & Audit
  email_subject TEXT,
  pitch_text TEXT,                       -- Founder-to-Founder MVP / App pitch
  audit_notes TEXT,                      -- Technical System Audit notes
  screenshot_url TEXT,
  
  -- Status & Queue Dispatch Lifecycle
  status TEXT DEFAULT 'NEW',             -- 'NEW', 'QUEUED', 'SENT', 'REPLIED', 'OPT_OUT', 'INVALID_DOMAIN'
  follow_up_step INT DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  
  -- Additional Raw Scraped Metadata
  raw_scraped_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create High-Performance Indexes for Filtering & Deduplication
CREATE INDEX IF NOT EXISTS idx_startup_leads_created_at ON startup_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_startup_leads_status ON startup_leads(status);
CREATE INDEX IF NOT EXISTS idx_startup_leads_work_email ON startup_leads(work_email);
CREATE INDEX IF NOT EXISTS idx_startup_leads_website_url ON startup_leads(website_url);
CREATE INDEX IF NOT EXISTS idx_startup_leads_campaign_id ON startup_leads(campaign_id);

-- 4. Automatically insert a default campaign for initial testing
INSERT INTO startup_campaigns (name, target_niche, source, yc_batch, daily_lead_limit, is_active)
SELECT 'HN & YC MVP Founders 001', 'MVP Web & Mobile Apps', 'HN_INTENT', 'W24', 20, true
WHERE NOT EXISTS (
    SELECT 1 FROM startup_campaigns WHERE name = 'HN & YC MVP Founders 001'
);
