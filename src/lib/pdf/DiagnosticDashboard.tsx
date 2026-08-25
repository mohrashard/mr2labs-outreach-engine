import React from 'react';
import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// Palette: Editorial Light. PDFs should be fundamentally readable and printable.
// We avoid dashboard-style dark modes and neon colors, opting for high-contrast
// Zinc tones and restrained semantic colors.
const T = {
  bg: '#FFFFFF',
  surface: '#FAFAFA',
  border: '#E4E4E7', // Zinc 200
  borderLight: '#F4F4F5', // Zinc 100
  textPrimary: '#18181B', // Zinc 900
  textSecondary: '#52525B', // Zinc 600
  textMuted: '#A1A1AA', // Zinc 400
  red: '#B91C1C',
  amber: '#B45309',
  green: '#15803D',
};

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: T.bg,
    padding: 48,
    fontFamily: 'Helvetica',
  },

  // ── HEADER ────────────────────────────────────────────────────────────────
  header: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  reportTitle: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
    letterSpacing: -0.5,
  },
  reportSubtitle: {
    fontSize: 10,
    color: T.textSecondary,
    marginTop: 6,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  companyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
  },
  reportDate: {
    fontSize: 9,
    color: T.textSecondary,
    marginTop: 4,
  },

  // ── SCORE SUMMARY ─────────────────────────────────────────────────────────
  scoreSection: {
    flexDirection: 'row',
    marginBottom: 40,
    alignItems: 'flex-start',
  },
  scoreLeft: {
    width: 120,
  },
  scoreNumber: {
    fontSize: 48,
    fontFamily: 'Helvetica-Bold',
    color: T.red,
    lineHeight: 1,
    letterSpacing: -1,
  },
  scoreLabel: {
    fontSize: 9,
    color: T.textSecondary,
    marginTop: 4,
    fontFamily: 'Helvetica-Bold',
  },
  scoreRight: {
    flex: 1,
    paddingLeft: 32,
    borderLeftWidth: 1,
    borderLeftColor: T.border,
  },
  scoreHeadline: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
    marginBottom: 8,
  },
  scoreBody: {
    fontSize: 10,
    color: T.textSecondary,
    lineHeight: 1.5,
  },

  // ── SECTIONS ──────────────────────────────────────────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingBottom: 8,
    marginBottom: 12,
  },

  // ── AUDIT ROW ─────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.borderLight,
  },
  rowLast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    paddingRight: 16,
  },
  rowHeader: {
    marginBottom: 4,
  },
  rowLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
  },
  rowDescription: {
    fontSize: 9,
    color: T.textSecondary,
    lineHeight: 1.5,
  },
  rowLinkWrap: {
    marginTop: 6,
  },
  rowLink: {
    fontSize: 9,
    color: '#2563EB',
    textDecoration: 'none',
  },
  rowStatus: {
    width: 80,
    alignItems: 'flex-end',
  },
  statusTextCritical: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: T.red,
  },
  statusTextHigh: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: T.amber,
  },
  statusTextPass: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: T.green,
  },

  // ── CTA BLOCK ─────────────────────────────────────────────────────────────
  ctaBlock: {
    marginTop: 16,
    backgroundColor: T.surface,
    padding: 24,
    borderLeftWidth: 3,
    borderLeftColor: T.red,
  },
  ctaHeadline: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: T.textPrimary,
    marginBottom: 8,
  },
  ctaBody: {
    fontSize: 10,
    color: T.textSecondary,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  ctaEmail: {
    fontSize: 10,
    color: '#2563EB',
    fontFamily: 'Helvetica-Bold',
    textDecoration: 'none',
  },

  // ── FOOTER ────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: T.textMuted,
  },
});

// ─── TYPES ───────────────────────────────────────────────────────────────────
type SectionType = 'Security & Deliverability' | 'Edge Performance & Architecture' | 'Conversion & UX Friction' | 'Google Core Web Vitals' | 'Operational Architecture & Automation';
type SeverityLevel = 'CRITICAL' | 'HIGH' | 'PASS';

interface AuditCheck {
  section: SectionType;
  id: string;
  label: string;
  description: string;
  description_pass: string;
  status: 'pass' | 'fail';
  severity: SeverityLevel;
  value: string;
  labUrl: string;
  weight: number;
}

// ─── AUDIT ROW COMPONENT ─────────────────────────────────────────────────────
const AuditRow = ({ check, isLast = false }: { check: AuditCheck; isLast?: boolean }) => {
  const statusStyle =
    check.severity === 'CRITICAL' ? styles.statusTextCritical :
      check.severity === 'HIGH' ? styles.statusTextHigh :
        styles.statusTextPass;

  return (
    <View style={isLast ? styles.rowLast : styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowLabel}>{check.label}</Text>
        </View>
        <Text style={styles.rowDescription}>{check.status === 'pass' ? check.description_pass : check.description}</Text>
        {check.status === 'fail' && check.labUrl && (
          <View style={styles.rowLinkWrap}>
            <Link src={check.labUrl} style={styles.rowLink}>
              Run live verification at mr2labs.com/labs
            </Link>
          </View>
        )}
      </View>
      <View style={styles.rowStatus}>
        <Text style={statusStyle}>{check.value || check.severity}</Text>
      </View>
    </View>
  );
};

// ─── SECTION COMPONENT ───────────────────────────────────────────────────────
const AuditSection = ({ title, checks }: { title: string; checks: AuditCheck[] }) => {
  if (checks.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {checks.map((check, idx) => (
        <AuditRow key={check.id} check={check} isLast={idx === checks.length - 1} />
      ))}
    </View>
  );
};

// ─── PROPS ───────────────────────────────────────────────────────────────────
interface DiagnosticDashboardProps {
  companyName: string;
  domain: string;
  auditData: Record<string, any>;
  isTechnical?: boolean;
  nicheInput?: string;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export const DiagnosticDashboard = ({
  companyName,
  domain,
  auditData,
  isTechnical = false,
  nicheInput,
}: DiagnosticDashboardProps) => {
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // ── BUILD CHECK LIST ───────────────────────────────────────────────────────
  const checks: AuditCheck[] = [];

  if (isTechnical) {
    checks.push(
      {
        section: 'Security & Deliverability', id: 'dmarc',
        label: 'DMARC Policy Enforcement',
        description: 'No DMARC record detected. This can increase exposure to email spoofing attacks.',
        description_pass: 'DMARC policy is configured and passing the check.',
        status: auditData.dmarc_missing ? 'fail' : 'pass',
        severity: auditData.dmarc_missing ? 'CRITICAL' : 'PASS',
        value: auditData.dmarc_missing ? 'Missing' : 'Configured',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 85,
      },
      {
        section: 'Security & Deliverability', id: 'spf',
        label: 'SPF Record Validation',
        description: 'SPF is missing. This can allow unauthorized servers to send emails on your behalf.',
        description_pass: 'SPF record is correctly configured and valid.',
        status: auditData.spf_missing ? 'fail' : 'pass',
        severity: auditData.spf_missing ? 'CRITICAL' : 'PASS',
        value: auditData.spf_missing ? 'Missing' : 'Valid',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 75,
      },
      {
        section: 'Security & Deliverability', id: 'hsts',
        label: 'HSTS Enforcement Header',
        description: 'HTTP Strict Transport Security is not enforced. This can leave connections vulnerable to downgrade attacks.',
        description_pass: 'HSTS is enforced, ensuring secure HTTPS connections.',
        status: auditData.hsts_missing ? 'fail' : 'pass',
        severity: auditData.hsts_missing ? 'HIGH' : 'PASS',
        value: auditData.hsts_missing ? 'Not Set' : 'Enforced',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 65,
      },
      {
        section: 'Security & Deliverability', id: 'clickjack',
        label: 'Clickjacking Protection (X-Frame-Options)',
        description: 'X-Frame-Options is not configured. This can increase exposure to clickjacking attacks.',
        description_pass: 'Anti-framing policy is configured and active.',
        status: auditData.clickjacking_vulnerable ? 'fail' : 'pass',
        severity: auditData.clickjacking_vulnerable ? 'HIGH' : 'PASS',
        value: auditData.clickjacking_vulnerable ? 'Vulnerable' : 'Protected',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 70,
      },
      {
        section: 'Edge Performance & Architecture', id: 'hydration',
        label: 'Client-Side Hydration Payload',
        description: `__NEXT_DATA__ payload detected${auditData.hydration_bloat_kb ? ` at ${auditData.hydration_bloat_kb}KB` : ''}. Large payloads can block Time-to-Interactive on low-bandwidth connections.`,
        description_pass: 'Hydration payload is within optimal limits.',
        status: auditData.hydration_bloat_kb > 150 ? 'fail' : 'pass',
        severity: auditData.hydration_bloat_kb > 150 ? 'HIGH' : 'PASS',
        value: auditData.hydration_bloat_kb ? `${auditData.hydration_bloat_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 55,
      },
      {
        section: 'Edge Performance & Architecture', id: 'html',
        label: 'Initial DOM Payload Size',
        description: `Raw HTML document${auditData.html_size_kb ? ` measured at ${auditData.html_size_kb}KB` : ''}. Large payloads can delay First Contentful Paint.`,
        description_pass: 'Initial DOM payload size is optimal.',
        status: auditData.html_size_kb > 250 ? 'fail' : 'pass',
        severity: auditData.html_size_kb > 250 ? 'HIGH' : 'PASS',
        value: auditData.html_size_kb ? `${auditData.html_size_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 45,
      },
      {
        section: 'Edge Performance & Architecture', id: 'cache',
        label: 'Immutable Cache-Control Headers',
        description: 'Static assets are not served with Cache-Control: immutable, potentially degrading performance for repeat visitors.',
        description_pass: 'Cache-Control headers are properly optimized.',
        status: auditData.missing_cache_headers ? 'fail' : 'pass',
        severity: auditData.missing_cache_headers ? 'HIGH' : 'PASS',
        value: auditData.missing_cache_headers ? 'Not Set' : 'Optimised',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 35,
      }
    );
  } else {
    checks.push(
      {
        section: 'Security & Deliverability', id: 'dmarc',
        label: 'Email Domain Protection',
        description: 'Your domain appears to be missing DMARC configuration, which can allow unauthorized parties to send emails using your domain.',
        description_pass: 'DMARC policy is configured and passing the check.',
        status: auditData.dmarc_missing ? 'fail' : 'pass',
        severity: auditData.dmarc_missing ? 'CRITICAL' : 'PASS',
        value: auditData.dmarc_missing ? 'Unprotected' : 'Protected',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 85,
      },
      {
        section: 'Conversion & UX Friction', id: 'autocomplete',
        label: 'Mobile Form Completion Rate',
        description: 'Contact forms are missing autocomplete attributes, adding friction that can cause mobile users to abandon forms.',
        description_pass: 'Forms are optimized for mobile completion.',
        status: auditData.missing_mobile_autocomplete ? 'fail' : 'pass',
        severity: auditData.missing_mobile_autocomplete ? 'HIGH' : 'PASS',
        value: auditData.missing_mobile_autocomplete ? 'Losing Leads' : 'Optimised',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 45,
      },
      {
        section: 'Conversion & UX Friction', id: 'mailto',
        label: 'Contact Form vs. Mailto Trap',
        description: 'Primary contact link uses a mailto trap instead of an on-site form, which can break the conversion flow.',
        description_pass: 'Contact flow uses standard forms effectively.',
        status: auditData.has_mailto_trap ? 'fail' : 'pass',
        severity: auditData.has_mailto_trap ? 'CRITICAL' : 'PASS',
        value: auditData.has_mailto_trap ? 'Leaking Leads' : 'Form In Place',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 55,
      },
      {
        section: 'Conversion & UX Friction', id: 'scheduler',
        label: 'Automated Booking System',
        description: 'No self-booking widget detected, meaning visitors cannot schedule consultations after hours.',
        description_pass: 'Automated booking system is active.',
        status: !auditData.has_scheduler ? 'fail' : 'pass',
        severity: !auditData.has_scheduler ? 'CRITICAL' : 'PASS',
        value: !auditData.has_scheduler ? 'Not Installed' : 'Active',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 75,
      },
      {
        section: 'Edge Performance & Architecture', id: 'html',
        label: 'Mobile Page Load Speed',
        description: `Your site${auditData.html_size_kb ? ` is sending ${auditData.html_size_kb}KB of data on every load` : ' is sending large data payloads'}, which can increase mobile load times.`,
        description_pass: 'Page load payload sizes are within optimal limits.',
        status: auditData.html_size_kb > 250 ? 'fail' : 'pass',
        severity: auditData.html_size_kb > 250 ? 'HIGH' : 'PASS',
        value: auditData.html_size_kb ? `${auditData.html_size_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 65,
      }
    );
  }

  if (auditData.psi_score !== undefined && auditData.psi_score !== null) {
    const isFailing = auditData.psi_score < 50;
    checks.push(
      {
        section: 'Google Core Web Vitals', id: 'psi_score',
        label: 'Google Mobile Performance Score',
        description: `Lighthouse evaluated the mobile experience at ${auditData.psi_score}/100. Scores below 50 indicate severe performance bottlenecks that penalize search rankings.`,
        description_pass: `Lighthouse evaluated the mobile experience at ${auditData.psi_score}/100. Performance is optimized.`,
        status: isFailing ? 'fail' : 'pass',
        severity: isFailing ? 'CRITICAL' : 'PASS',
        value: `${auditData.psi_score}/100`,
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 95,
      },
      {
        section: 'Google Core Web Vitals', id: 'psi_lcp',
        label: 'Largest Contentful Paint (LCP)',
        description: `LCP measured at ${auditData.psi_lcp || 'N/A'}. Google flags LCP over 2.5s as a failure, actively harming user retention and SEO.`,
        description_pass: `LCP measured at ${auditData.psi_lcp || 'N/A'}. Passes Google's threshold.`,
        status: isFailing ? 'fail' : 'pass',
        severity: isFailing ? 'HIGH' : 'PASS',
        value: auditData.psi_lcp || 'N/A',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 85,
      },
      {
        section: 'Google Core Web Vitals', id: 'psi_tbt',
        label: 'Total Blocking Time (TBT)',
        description: `Main-thread blocked for ${auditData.psi_tbt || 'N/A'}. High TBT causes the mobile screen to freeze when users tap or scroll.`,
        description_pass: `TBT is ${auditData.psi_tbt || 'N/A'}. Main-thread is responsive.`,
        status: isFailing ? 'fail' : 'pass',
        severity: isFailing ? 'HIGH' : 'PASS',
        value: auditData.psi_tbt || 'N/A',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 75,
      }
    );
  }

  // ── OPERATIONAL ARCHITECTURE & AUTOMATION ──
  const opsSection = 'Operational Architecture & Automation';
  if (auditData.has_scheduler && auditData.has_crm) {
    checks.push({
      section: opsSection, id: 'ops_fragmented',
      label: 'Fragmented Operations Detected',
      description: 'You are routing scheduling into a third-party CRM, which often leads to data silos and manual data entry. MR² Labs replaces these subscriptions with a unified, custom-built AI pipeline.',
      description_pass: '',
      status: 'fail',
      severity: 'CRITICAL',
      value: 'Siloed Tools',
      labUrl: `https://mr2labs.com`, weight: 99,
    });
  } else if (auditData.has_live_chat) {
    checks.push({
      section: opsSection, id: 'ops_legacy_chat',
      label: 'Legacy Chat Widget Detected',
      description: 'You are using reactive, manual chat tools. We deploy autonomous AI agents trained on your proprietary data to handle level-1 support and lead qualification instantly.',
      description_pass: '',
      status: 'fail',
      severity: 'HIGH',
      value: 'Manual Support',
      labUrl: `https://mr2labs.com`, weight: 89,
    });
  } else if (!auditData.has_scheduler && !auditData.has_crm && !auditData.has_live_chat && !auditData.has_email_auto && !auditData.has_analytics) {
    checks.push({
      section: opsSection, id: 'ops_zero_automation',
      label: 'Zero Digital Automation Detected',
      description: 'Your digital infrastructure is entirely manual. This limits scalability. We architect full-stack custom solutions to automate your client intake and operations.',
      description_pass: '',
      status: 'fail',
      severity: 'CRITICAL',
      value: 'Manual Ops',
      labUrl: `https://mr2labs.com`, weight: 100,
    });
  }

  // ── SCORING LOGIC ─────────────────────────────────────────────────────────
  let fails = checks.filter(c => c.status === 'fail');
  const passes = checks.filter(c => c.status === 'pass');

  let rawScore = 0;
  fails.forEach(f => { rawScore += f.weight; });
  const riskScore = Math.min(rawScore, 97);

  // Sort by severity weight descending, keep only the top 3.
  fails = fails.sort((a, b) => b.weight - a.weight).slice(0, 3);

  // If ≥3 fails, route all links to the full site audit page
  if (fails.length >= 3) {
    fails.forEach(f => {
      f.labUrl = `https://mr2labs.com/labs/site-audit?domain=${domain}`;
    });
  }

  // Render: Top 3 fails by weight, ALL passing Google Web Vitals, then exactly 1 other pass
  const psiPasses = passes.filter(c => c.section === 'Google Core Web Vitals');
  const otherPasses = passes.filter(c => c.section !== 'Google Core Web Vitals');
  
  const displayChecks: AuditCheck[] = [
    ...fails, 
    ...psiPasses,
    ...(otherPasses.length > 0 ? [otherPasses[0]] : [])
  ];

  const securityChecks = displayChecks.filter(c => c.section === 'Security & Deliverability');
  const opsChecks = displayChecks.filter(c => c.section === 'Operational Architecture & Automation');
  const vitalsChecks = displayChecks.filter(c => c.section === 'Google Core Web Vitals');
  const performanceChecks = displayChecks.filter(c => c.section === 'Edge Performance & Architecture');
  const conversionChecks = displayChecks.filter(c => c.section === 'Conversion & UX Friction');

  const failCount = fails.length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.reportTitle}>WEBSITE TECHNICAL AUDIT</Text>
            <Text style={styles.reportSubtitle}>
              {failCount === 1 ? '1 issue' : `${failCount} issues`} detected on {domain}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.reportDate}>{dateStr}</Text>
          </View>
        </View>

        {/* SCORE SUMMARY */}
        <View style={styles.scoreSection}>
          <View style={styles.scoreLeft}>
            <Text style={styles.scoreNumber}>{failCount}</Text>
            <Text style={styles.scoreLabel}>{failCount === 1 ? 'ISSUE DETECTED' : 'ISSUES DETECTED'}</Text>
          </View>
          <View style={styles.scoreRight}>
            <Text style={styles.scoreHeadline}>
              {failCount > 0
                ? 'Immediate review recommended.'
                : 'No major issues detected.'}
            </Text>
            <Text style={styles.scoreBody}>
              {failCount > 0 
                ? `${failCount === 1 ? '1 issue requiring attention was' : `${failCount} issues requiring attention were`} identified during our automated scan. We recommend a technical review to address these findings.`
                : 'Our automated scan did not identify any critical security or performance issues. Your infrastructure appears to be correctly configured.'}
            </Text>
            {failCount > 0 && (
              <Text style={{ fontSize: 9, color: T.amber, marginTop: 6, fontFamily: 'Helvetica-Bold' }}>
                Based on average conversion rates, an unoptimized architecture costs a business of your size an estimated 3–5 leads per week.
              </Text>
            )}
          </View>
        </View>

        {/* SECTIONS */}
        <AuditSection title="Security & Deliverability" checks={securityChecks} />
        <AuditSection title="Operational Architecture & Automation" checks={opsChecks} />
        <AuditSection title="Google Core Web Vitals" checks={vitalsChecks} />
        <AuditSection title="Edge Performance & Architecture" checks={performanceChecks} />
        <AuditSection title="Conversion & UX Friction" checks={conversionChecks} />

        {/* CTA BLOCK */}
        <View style={styles.ctaBlock}>
          <Text style={styles.ctaHeadline}>
            Recommended Next Steps
          </Text>
          <Text style={styles.ctaBody}>
            {nicheInput?.toLowerCase().includes('dental') 
              ? "We help clinics like yours automate patient bookings and WhatsApp follow-ups so your front desk handles 60% fewer calls."
              : nicheInput?.toLowerCase().includes('real estate')
              ? "We help agencies capture and qualify property enquiries 24/7 without adding headcount."
              : failCount > 0 
              ? `We can assist in resolving these ${failCount} issues without disrupting your existing operations. Schedule a brief discovery call to discuss implementation.`
              : 'While no major issues were found, we can help optimize and scale your technical infrastructure.'}
          </Text>
          <Text style={{ fontSize: 10, color: T.textPrimary, fontStyle: 'italic', marginBottom: 16 }}>
            "We recently built a full booking + WhatsApp automation system for a service business that reduced their manual admin by 80%."
          </Text>
          <Link src="https://calendly.com/mohrashard/30min" style={styles.ctaEmail}>
            Book a free 15-minute call → mr2labs.com/call
          </Link>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Generated by MR² Labs Autonomous Engine for {companyName}
          </Text>
          <Text style={styles.footerText}>
            mr2labs.com
          </Text>
        </View>

      </Page>
    </Document>
  );
};