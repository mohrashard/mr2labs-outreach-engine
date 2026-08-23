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
type SectionType = 'Security & Deliverability' | 'Edge Performance & Architecture' | 'Conversion & UX Friction';
type SeverityLevel = 'CRITICAL' | 'HIGH' | 'PASS';

interface AuditCheck {
  section: SectionType;
  id: string;
  label: string;
  description: string;
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
        <Text style={styles.rowDescription}>{check.description}</Text>
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
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export const DiagnosticDashboard = ({
  companyName,
  domain,
  auditData,
  isTechnical = false,
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
        description: 'No DMARC record detected. Any attacker can send email impersonating your domain to clients, partners, and prospects, with zero authentication failure reported to you.',
        status: auditData.dmarc_missing ? 'fail' : 'pass',
        severity: auditData.dmarc_missing ? 'CRITICAL' : 'PASS',
        value: auditData.dmarc_missing ? 'Missing' : 'Configured',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 85,
      },
      {
        section: 'Security & Deliverability', id: 'spf',
        label: 'SPF Record Validation',
        description: 'SPF authorises which mail servers can send on your behalf. Without it, spoofed emails from your domain pass basic MX checks at recipient servers.',
        status: auditData.spf_missing ? 'fail' : 'pass',
        severity: auditData.spf_missing ? 'CRITICAL' : 'PASS',
        value: auditData.spf_missing ? 'Missing' : 'Valid',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 75,
      },
      {
        section: 'Security & Deliverability', id: 'hsts',
        label: 'HSTS Enforcement Header',
        description: 'HTTP Strict Transport Security forces all connections to HTTPS. Without it, clients on public Wi-Fi are vulnerable to SSL stripping and downgrade attacks.',
        status: auditData.hsts_missing ? 'fail' : 'pass',
        severity: auditData.hsts_missing ? 'HIGH' : 'PASS',
        value: auditData.hsts_missing ? 'Not Set' : 'Enforced',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 65,
      },
      {
        section: 'Security & Deliverability', id: 'clickjack',
        label: 'Clickjacking Protection (X-Frame-Options)',
        description: 'No X-Frame-Options or frame-ancestors CSP directive detected. Your site can be embedded in a malicious iframe to hijack user interactions.',
        status: auditData.clickjacking_vulnerable ? 'fail' : 'pass',
        severity: auditData.clickjacking_vulnerable ? 'HIGH' : 'PASS',
        value: auditData.clickjacking_vulnerable ? 'Vulnerable' : 'Protected',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 70,
      },
      {
        section: 'Edge Performance & Architecture', id: 'hydration',
        label: 'Client-Side Hydration Payload',
        description: `__NEXT_DATA__ payload detected${auditData.hydration_bloat_kb ? ` at ${auditData.hydration_bloat_kb}KB` : ''}. Oversized hydration blocks Time-to-Interactive on low-bandwidth connections and inflates egress costs at scale.`,
        status: auditData.hydration_bloat_kb > 150 ? 'fail' : 'pass',
        severity: auditData.hydration_bloat_kb > 150 ? 'HIGH' : 'PASS',
        value: auditData.hydration_bloat_kb ? `${auditData.hydration_bloat_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 55,
      },
      {
        section: 'Edge Performance & Architecture', id: 'html',
        label: 'Initial DOM Payload Size',
        description: `Raw HTML document${auditData.html_size_kb ? ` measured at ${auditData.html_size_kb}KB` : ''}. Excessive DOM payloads block the parser, delay First Contentful Paint, and are disproportionately penalised by Google Core Web Vitals.`,
        status: auditData.html_size_kb > 250 ? 'fail' : 'pass',
        severity: auditData.html_size_kb > 250 ? 'HIGH' : 'PASS',
        value: auditData.html_size_kb ? `${auditData.html_size_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 45,
      },
      {
        section: 'Edge Performance & Architecture', id: 'cache',
        label: 'Immutable Cache-Control Headers',
        description: 'Static assets (JS, CSS, images) are not served with Cache-Control: immutable. Every repeat visitor re-downloads unchanged assets, degrading performance and increasing CDN costs.',
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
        description: 'Your domain has no email authentication record. A competitor or scammer can send emails that appear to come from your business directly to your clients, with no way for you to detect or block it.',
        status: auditData.dmarc_missing ? 'fail' : 'pass',
        severity: auditData.dmarc_missing ? 'CRITICAL' : 'PASS',
        value: auditData.dmarc_missing ? 'Unprotected' : 'Protected',
        labUrl: `https://mr2labs.com/labs/security?domain=${domain}`, weight: 85,
      },
      {
        section: 'Conversion & UX Friction', id: 'autocomplete',
        label: 'Mobile Form Completion Rate',
        description: 'Your contact forms are missing autocomplete attributes. On mobile, this forces visitors to manually type their full name, email, and phone number, causing approximately 30% of mobile users to abandon before submitting.',
        status: auditData.missing_mobile_autocomplete ? 'fail' : 'pass',
        severity: auditData.missing_mobile_autocomplete ? 'HIGH' : 'PASS',
        value: auditData.missing_mobile_autocomplete ? 'Losing Leads' : 'Optimised',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 45,
      },
      {
        section: 'Conversion & UX Friction', id: 'mailto',
        label: 'Contact Form vs. Mailto Trap',
        description: 'Your primary contact link opens a mail app instead of a form on your site. This ejects the user out of the browser, breaks the conversion flow, and captures zero lead data if they bounce.',
        status: auditData.has_mailto_trap ? 'fail' : 'pass',
        severity: auditData.has_mailto_trap ? 'CRITICAL' : 'PASS',
        value: auditData.has_mailto_trap ? 'Leaking Leads' : 'Form In Place',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 55,
      },
      {
        section: 'Conversion & UX Friction', id: 'scheduler',
        label: 'Automated Booking System',
        description: 'No self-booking widget detected. High-intent visitors who arrive outside business hours have no way to schedule themselves in. They leave and book a competitor who has 24/7 availability.',
        status: !auditData.has_scheduler ? 'fail' : 'pass',
        severity: !auditData.has_scheduler ? 'CRITICAL' : 'PASS',
        value: !auditData.has_scheduler ? 'Not Installed' : 'Active',
        labUrl: `https://mr2labs.com/labs/conversion?domain=${domain}`, weight: 75,
      },
      {
        section: 'Edge Performance & Architecture', id: 'html',
        label: 'Mobile Page Load Speed',
        description: `Your site${auditData.html_size_kb ? ` is sending ${auditData.html_size_kb}KB of data on every load` : ' is sending excessive data on every load'}. On a mobile connection, every extra 100KB adds load time. Studies show a 1-second delay reduces conversions by 7%.`,
        status: auditData.html_size_kb > 250 ? 'fail' : 'pass',
        severity: auditData.html_size_kb > 250 ? 'HIGH' : 'PASS',
        value: auditData.html_size_kb ? `${auditData.html_size_kb} KB` : 'Optimal',
        labUrl: `https://mr2labs.com/labs/performance?domain=${domain}`, weight: 65,
      }
    );
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

  // Render: Top 3 fails by weight, then exactly 1 pass
  const displayChecks: AuditCheck[] = [...fails, ...(passes.length > 0 ? [passes[0]] : [])];

  const securityChecks = displayChecks.filter(c => c.section === 'Security & Deliverability');
  const performanceChecks = displayChecks.filter(c => c.section === 'Edge Performance & Architecture');
  const conversionChecks = displayChecks.filter(c => c.section === 'Conversion & UX Friction');

  const failCount = fails.length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.reportTitle}>Site Forensics</Text>
            <Text style={styles.reportSubtitle}>
              {failCount} critical {failCount === 1 ? 'issue' : 'issues'} detected on {domain}
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
            <Text style={styles.scoreNumber}>{riskScore}</Text>
            <Text style={styles.scoreLabel}>Risk Exposure</Text>
          </View>
          <View style={styles.scoreRight}>
            <Text style={styles.scoreHeadline}>
              {riskScore >= 80
                ? 'Critical infrastructure exposure detected.'
                : riskScore >= 50
                  ? 'Significant vulnerabilities requiring remediation.'
                  : 'Issues detected, remediation recommended.'}
            </Text>
            <Text style={styles.scoreBody}>
              Our automated systems found {failCount} critical issues on your domain.
              These items represent quantifiable risks to your conversion rate, security, and client trust.
            </Text>
          </View>
        </View>

        {/* SECTIONS */}
        <AuditSection title="Security & Deliverability" checks={securityChecks} />
        <AuditSection title="Edge Performance & Architecture" checks={performanceChecks} />
        <AuditSection title="Conversion & UX Friction" checks={conversionChecks} />

        {/* CTA BLOCK */}
        <View style={styles.ctaBlock}>
          <Text style={styles.ctaHeadline}>
            Remediation Plan
          </Text>
          <Text style={styles.ctaBody}>
            We can resolve all {failCount} of these issues within 72 hours without disrupting your existing site. Reply to the email this report was attached to, or contact us directly.
          </Text>
          <Link src="mailto:growth@mr2labs.com" style={styles.ctaEmail}>
            growth@mr2labs.com
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