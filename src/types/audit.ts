export interface AuditPerformance {
  score?: number;
  lcp?: string;
  tbt?: string;
  cls?: string;
  passed?: boolean;
}

export interface AuditLeadCapture {
  live_chat?: boolean;
  scheduler?: boolean;
  crm?: string | null;
  mailto_traps?: boolean;
}

export interface AuditSecurity {
  spf?: boolean;
  dmarc?: boolean;
  caa?: boolean;
  hsts?: boolean;
  clickjacking?: boolean;
}

export interface AuditCodeQuality {
  platform?: string;
  script_bloat?: boolean;
  unoptimized_images?: boolean;
}

export interface AuditSEO {
  og_tags?: boolean;
  meta_desc?: boolean;
  heading_hierarchy?: boolean;
  alt_text?: boolean;
}

export interface AuditData {
  performance?: AuditPerformance;
  lead_capture?: AuditLeadCapture;
  security?: AuditSecurity;
  code_quality?: AuditCodeQuality;
  seo?: AuditSEO;
}

export type IssueSeverity = 'critical' | 'moderate' | 'passing';

export interface AuditIssue {
  id: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  category: 'security' | 'lead_capture' | 'performance' | 'code_quality' | 'seo';
}

export interface SolutionCard {
  id: string;
  title: string;
  estimated_days: string;
  description: string;
  tag: string;
  mapped_issue_ids: string[];
}

export interface AuditSubmissionPayload {
  lead_id: string;
  company_name: string;
  domain: string;
  email: string;
  contact_name?: string;
  priority_notes?: string;
}

export interface AuditSubmissionRecord extends AuditSubmissionPayload {
  id: string;
  created_at: string;
}
