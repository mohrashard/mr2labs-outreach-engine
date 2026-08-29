import { AuditData } from './audit';

export type LeadStatus = 
  | 'NEW' 
  | 'QUEUED' 
  | 'SENT' 
  | 'REPLIED' 
  | 'MISSING_EMAIL' 
  | 'UNCONTACTABLE' 
  | 'INVALID_DOMAIN'
  | 'HOLD'
  | 'REJECTED';

export interface OutreachLead {
  id: string;
  campaign_id: string;
  company_name: string;
  website_url: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  email_subject?: string | null;
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
  created_at: string;
}
