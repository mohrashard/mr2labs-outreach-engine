import { AuditData, AuditIssue, SolutionCard, IssueSeverity } from '@/types/audit';

/**
 * Ensures audit data exists by returning the structured audit_data object,
 * or dynamically building one from raw_scraped_data if audit_data is null/empty.
 */
export function normalizeAuditData(rawLead: Record<string, any>): AuditData {
  if (rawLead.audit_data && typeof rawLead.audit_data === 'object' && Object.keys(rawLead.audit_data).length > 0) {
    return rawLead.audit_data as AuditData;
  }

  // Extract fallback audit data from raw_scraped_data if present
  const rawScraped = typeof rawLead.raw_scraped_data === 'string'
    ? safeJsonParse(rawLead.raw_scraped_data)
    : rawLead.raw_scraped_data || {};

  return {
    performance: {
      score: rawScraped.performance_score || rawScraped.speed_score || 42,
      lcp: rawScraped.lcp || '3.8s',
      tbt: rawScraped.tbt || '380ms',
      cls: rawScraped.cls || '0.12',
      passed: (rawScraped.performance_score || 42) >= 75,
    },
    lead_capture: {
      live_chat: Boolean(rawScraped.has_live_chat || rawScraped.live_chat),
      scheduler: Boolean(rawScraped.has_scheduler || rawScraped.calendly),
      crm: rawScraped.crm || null,
      mailto_traps: Boolean(rawScraped.has_mailto_traps ?? true),
    },
    security: {
      spf: Boolean(rawScraped.spf ?? true),
      dmarc: Boolean(rawScraped.dmarc ?? false),
      caa: Boolean(rawScraped.caa ?? false),
      hsts: Boolean(rawScraped.hsts ?? false),
      clickjacking: Boolean(rawScraped.clickjacking ?? true),
    },
    code_quality: {
      platform: rawScraped.platform || rawScraped.cms || 'Custom / Webflow',
      script_bloat: Boolean(rawScraped.script_bloat ?? true),
      unoptimized_images: Boolean(rawScraped.unoptimized_images ?? true),
    },
    seo: {
      og_tags: Boolean(rawScraped.og_tags ?? true),
      meta_desc: Boolean(rawScraped.meta_desc ?? true),
      heading_hierarchy: Boolean(rawScraped.heading_hierarchy ?? false),
      alt_text: Boolean(rawScraped.alt_text ?? false),
    },
  };
}

function safeJsonParse(val: string): Record<string, any> {
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

/**
 * Categorizes an AuditData object into critical, moderate, and passing issue buckets.
 */
export function categorizeAuditIssues(audit: AuditData) {
  const critical: AuditIssue[] = [];
  const moderate: AuditIssue[] = [];
  const passing: AuditIssue[] = [];

  // 1. Security Checks
  if (audit.security?.dmarc === false) {
    critical.push({
      id: 'dmarc_missing',
      title: 'DMARC not configured',
      description: 'High risk of email spoofing & spam filter domain flags.',
      severity: 'critical',
      category: 'security',
    });
  } else if (audit.security?.dmarc === true) {
    passing.push({
      id: 'dmarc_ok',
      title: 'DMARC policy configured ✓',
      description: 'Domain authenticated against spoofing attacks.',
      severity: 'passing',
      category: 'security',
    });
  }

  if (audit.security?.spf === false) {
    moderate.push({
      id: 'spf_missing',
      title: 'SPF record missing',
      description: 'Outbound emails risk landing in customer junk folders.',
      severity: 'moderate',
      category: 'security',
    });
  } else if (audit.security?.spf === true) {
    passing.push({
      id: 'spf_ok',
      title: 'SPF record verified ✓',
      description: 'Authorized email sending IPs configured properly.',
      severity: 'passing',
      category: 'security',
    });
  }

  // 2. Lead Capture Checks
  if (audit.lead_capture?.live_chat === false) {
    critical.push({
      id: 'live_chat_missing',
      title: 'No live chat detected',
      description: 'Losing mobile & high-intent leads in real time without instant engagement.',
      severity: 'critical',
      category: 'lead_capture',
    });
  } else if (audit.lead_capture?.live_chat === true) {
    passing.push({
      id: 'live_chat_ok',
      title: 'Live chat active ✓',
      description: 'Real-time visitor chat tool identified on site.',
      severity: 'passing',
      category: 'lead_capture',
    });
  }

  if (audit.lead_capture?.scheduler === false) {
    critical.push({
      id: 'scheduler_missing',
      title: 'No instant call scheduler',
      description: 'Prospects must fill out static contact forms instead of self-booking.',
      severity: 'critical',
      category: 'lead_capture',
    });
  } else if (audit.lead_capture?.scheduler === true) {
    passing.push({
      id: 'scheduler_ok',
      title: 'Call scheduler active ✓',
      description: 'Direct calendar booking available for prospects.',
      severity: 'passing',
      category: 'lead_capture',
    });
  }

  if (!audit.lead_capture?.crm) {
    moderate.push({
      id: 'crm_missing',
      title: 'No CRM detected',
      description: 'Manual follow-ups costing team time and causing lead leakages.',
      severity: 'moderate',
      category: 'lead_capture',
    });
  } else {
    passing.push({
      id: 'crm_ok',
      title: `CRM system active (${audit.lead_capture.crm}) ✓`,
      description: 'Inbound leads automatically sync to CRM workflow.',
      severity: 'passing',
      category: 'lead_capture',
    });
  }

  // 3. Performance Checks
  const perfScore = audit.performance?.score ?? 50;
  if (perfScore < 50) {
    moderate.push({
      id: 'speed_low',
      title: `Mobile speed score ${perfScore}/100`,
      description: 'Estimated 40%+ bounce rate on mobile devices due to slow load times.',
      severity: 'moderate',
      category: 'performance',
    });
  } else {
    passing.push({
      id: 'speed_ok',
      title: `Mobile speed score ${perfScore}/100 ✓`,
      description: 'Fast core web vitals response time.',
      severity: 'passing',
      category: 'performance',
    });
  }

  if (audit.code_quality?.unoptimized_images) {
    moderate.push({
      id: 'unoptimized_images',
      title: 'Unoptimized hero & media images',
      description: 'Heavy uncompressed assets causing noticeable layout shift and rendering lag.',
      severity: 'moderate',
      category: 'code_quality',
    });
  }

  // 4. SEO & Metadata
  if (audit.seo?.meta_desc === false) {
    moderate.push({
      id: 'meta_desc_missing',
      title: 'Missing meta description tag',
      description: 'Lower search engine click-through rates due to auto-generated snippet.',
      severity: 'moderate',
      category: 'seo',
    });
  } else if (audit.seo?.meta_desc === true) {
    passing.push({
      id: 'meta_desc_ok',
      title: 'Meta description present ✓',
      description: 'Custom search preview configured for search engines.',
      severity: 'passing',
      category: 'seo',
    });
  }

  if (audit.seo?.og_tags === false) {
    moderate.push({
      id: 'og_tags_missing',
      title: 'Missing Open Graph preview tags',
      description: 'Links shared on LinkedIn, WhatsApp, or Twitter lack branded rich previews.',
      severity: 'moderate',
      category: 'seo',
    });
  } else if (audit.seo?.og_tags === true) {
    passing.push({
      id: 'og_tags_ok',
      title: 'Open Graph social tags present ✓',
      description: 'Rich link previews display correctly across messaging & social apps.',
      severity: 'passing',
      category: 'seo',
    });
  }

  return { critical, moderate, passing };
}

/**
 * Maps identified critical & moderate issues directly into solution proposal cards.
 */
export function buildSolutionCards(critical: AuditIssue[], moderate: AuditIssue[]): SolutionCard[] {
  const cards: SolutionCard[] = [];
  const activeIssueIds = new Set([...critical, ...moderate].map((i) => i.id));

  if (activeIssueIds.has('live_chat_missing') || activeIssueIds.has('scheduler_missing')) {
    cards.push({
      id: 'sol_live_chat',
      title: 'Live Chat + WhatsApp & Booking Integration',
      estimated_days: '3 days',
      description: 'Implement a high-converting instant chat widget with automated WhatsApp routing and calendar sync to capture mobile visitors before they bounce.',
      tag: 'Lead Capture',
      mapped_issue_ids: ['live_chat_missing', 'scheduler_missing'].filter((id) => activeIssueIds.has(id)),
    });
  }

  if (activeIssueIds.has('dmarc_missing') || activeIssueIds.has('spf_missing')) {
    cards.push({
      id: 'sol_dmarc',
      title: 'DMARC + Email Security & Deliverability Hardening',
      estimated_days: '1 day',
      description: 'Configure strict SPF, DMARC, and DKIM DNS records to block domain spoofing and guarantee outbound emails hit the primary inbox.',
      tag: 'Security & DNS',
      mapped_issue_ids: ['dmarc_missing', 'spf_missing'].filter((id) => activeIssueIds.has(id)),
    });
  }

  if (activeIssueIds.has('speed_low') || activeIssueIds.has('unoptimized_images')) {
    cards.push({
      id: 'sol_speed',
      title: 'Core Web Vitals & Speed Optimization',
      estimated_days: '2 days',
      description: 'Compress image assets into WebP format, defer non-critical JS scripts, and optimize caching to achieve 90+ mobile speed scores.',
      tag: 'Performance',
      mapped_issue_ids: ['speed_low', 'unoptimized_images'].filter((id) => activeIssueIds.has(id)),
    });
  }

  if (activeIssueIds.has('crm_missing')) {
    cards.push({
      id: 'sol_crm',
      title: 'Automated CRM Lead Pipeline & Slack Notifications',
      estimated_days: '2 days',
      description: 'Wire lead form submissions directly to your CRM with real-time push alerts so your sales team contacts inbound leads within 5 minutes.',
      tag: 'Automation',
      mapped_issue_ids: ['crm_missing'],
    });
  }

  if (activeIssueIds.has('meta_desc_missing') || activeIssueIds.has('og_tags_missing')) {
    cards.push({
      id: 'sol_seo',
      title: 'Social Share Cards & SEO Metadata Polish',
      estimated_days: '1 day',
      description: 'Install customized Open Graph tags, Twitter Cards, and search meta descriptions to ensure shared site links display high-converting previews.',
      tag: 'Growth SEO',
      mapped_issue_ids: ['meta_desc_missing', 'og_tags_missing'].filter((id) => activeIssueIds.has(id)),
    });
  }

  // Fallback default card if site is already clean
  if (cards.length === 0) {
    cards.push({
      id: 'sol_growth_audit',
      title: 'Custom Conversion Rate Optimization Audit',
      estimated_days: '2 days',
      description: 'Deep-dive user flow analysis, landing page copywriting refinement, and A/B test setup to maximize existing visitor conversions.',
      tag: 'CRO Optimization',
      mapped_issue_ids: [],
    });
  }

  return cards;
}
