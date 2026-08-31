import { LeadStatus } from './lead';

export interface StartupCampaign {
  id: string;
  name: string;
  target_niche: string;
  source: 'HN_INTENT' | 'YC_FUNDED' | 'PRODUCT_HUNT';
  yc_batch?: string;
  daily_lead_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface StartupLead {
  id: string;
  campaign_id?: string | null;
  company_name: string;
  website_url: string;
  founder_name?: string | null;
  founder_title?: string | null;
  work_email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  twitter_url?: string | null;
  source_type: 'HN_INTENT' | 'YC_FUNDED' | 'PRODUCT_HUNT';
  yc_batch?: string | null;
  tech_stack?: string[];
  intent_snippet?: string | null;
  email_subject?: string | null;
  pitch_text?: string | null;
  audit_notes?: string | null;
  screenshot_url?: string | null;
  status: LeadStatus;
  follow_up_step?: number;
  scheduled_for?: string | null;
  sent_at?: string | null;
  last_contacted_at?: string | null;
  raw_scraped_data?: Record<string, any> | null;
  created_at: string;
  updated_at?: string;
}
