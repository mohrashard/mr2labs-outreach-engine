import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyLeadComprehensive } from '@/lib/verification/import-verifier';
import { autoHealLeadComprehensive } from '@/lib/verification/auto-healer';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function cleanDomain(url?: string | null): string {
  if (!url) return '';
  return url
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/[?#].*$/, '');
}

function findValue(row: Record<string, any>, possibleKeys: string[]): string | null {
  const keys = Object.keys(row);
  const foundKey = keys.find(k => 
    possibleKeys.some(pk => pk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''))
  );
  if (!foundKey) return null;
  const val = row[foundKey];
  return typeof val === 'string' ? val.trim() : (val !== null && val !== undefined ? String(val).trim() : null);
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours <= 0) return 'Just now';
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFollowUpStepLabel(step?: number | null, status?: string): string {
  if (status === 'REPLIED') return 'Replied (Goal Met)';
  if (status === 'BOUNCED') return 'Bounced (Email Dead)';
  if (status === 'STOP') return 'Unsubscribed / Stopped';
  
  switch (step) {
    case 1:
      return 'Step 1: Initial Outreach Sent';
    case 2:
      return 'Step 2: Follow-up #1 Sent';
    case 3:
      return 'Step 3: Follow-up #2 Sent';
    case 4:
      return 'Step 4: Final Breakup Sent';
    default:
      return status === 'SENT' ? 'Initial Email Sent' : 'Step 0: Not Sent Yet';
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No CSV rows provided.' }, { status: 400 });
    }

    // 1. Fetch all existing leads for comparison
    const { data: existingLeadsRaw, error: dbErr } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, website_url, email, status, sent_at, follow_up_step, last_contacted_at, email_subject, company_name, created_at');

    if (dbErr) {
      console.error('[CSV Verify API] DB Query error:', dbErr);
    }

    const leadsByDomain = new Map<string, any>();
    const leadsByEmail = new Map<string, any>();

    for (const l of existingLeadsRaw || []) {
      if (l.website_url) {
        const dom = cleanDomain(l.website_url);
        if (dom && !leadsByDomain.has(dom)) leadsByDomain.set(dom, l);
      }
      if (l.email) {
        const em = l.email.toLowerCase().trim();
        if (em && !leadsByEmail.has(em)) leadsByEmail.set(em, l);
      }
    }

    // 2. Parse & Standardize Incoming CSV Rows
    const mappedRows = rows.map((row, index) => {
      const companyName = findValue(row, ['Business Name', 'Company Name', 'Company', 'Organization', 'Business']) || 'Unnamed Company';
      
      let founderName = findValue(row, ['Founder / Decision Maker Name', 'Founder / Decision Maker', 'Founder', 'Decision Maker', 'Founder Name', 'Contact Name', 'Full Name', 'Name']);
      const firstName = findValue(row, ['First Name', 'First']);
      const lastName = findValue(row, ['Last Name', 'Last']);
      if (!founderName && (firstName || lastName)) {
        founderName = `${firstName || ''} ${lastName || ''}`.trim();
      }

      const email = findValue(row, ['Working Inbox Email', 'Work Email', 'Inbox Email', 'Email', 'Direct Email', 'Contact Email', 'Mail', 'Inbox']);
      let websiteUrl = findValue(row, ['Website', 'Website URL', 'Domain', 'URL', 'Company URL']);
      
      // Fallback domain from email if website is omitted
      if (!websiteUrl && email && email.includes('@')) {
        const domainPart = email.split('@')[1];
        if (domainPart && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'].includes(domainPart.toLowerCase())) {
          websiteUrl = `https://${domainPart}`;
        }
      }

      const linkedinUrl = findValue(row, ['LinkedIn URL', 'LinkedIn', 'Person LinkedIn Url', 'Company LinkedIn Url', 'Person LinkedIn', 'Company LinkedIn']);
      const instagramUrl = findValue(row, ['Instagram URL', 'Instagram', 'IG', 'Insta']);
      const painPoint = findValue(row, ['Pain Point', 'Pain Points', 'Problem', 'Friction', 'Issue', 'Customer Pain Point']);
      const mr2Solution = findValue(row, ['Mr² Labs Solution', 'Mr2 Labs Solution', 'Solution', 'Offer', 'Service', 'Recommended Service']);

      return {
        rowIndex: index + 1,
        companyName,
        founderName,
        email: email ? email.toLowerCase().trim() : null,
        websiteUrl: websiteUrl ? websiteUrl.trim() : null,
        linkedinUrl,
        instagramUrl,
        painPoint,
        mr2Solution,
        raw: row
      };
    });

    const verifiedList: any[] = [];
    const existingList: any[] = [];
    const invalidList: any[] = [];

    // Helper for email verification with caching
    const verificationCache = new Map<string, { isValid: boolean; verifier: string; isCatchAll: boolean; reason?: string }>();

    // Cap at 5 leads per request to strictly respect Vercel Hobby Tier's 10s ceiling
    const HOBBY_TIER_MAX = 5;
    const leadsToVerify = mappedRows.slice(0, HOBBY_TIER_MAX);

    await Promise.all(leadsToVerify.map(async (lead) => {
      const domain = cleanDomain(lead.websiteUrl);
      const email = lead.email;

      // A. Check if already in Database
      let existingMatch = null;
      if (email && leadsByEmail.has(email)) {
        existingMatch = leadsByEmail.get(email);
      } else if (domain && leadsByDomain.has(domain)) {
        existingMatch = leadsByDomain.get(domain);
      }

      if (existingMatch) {
        const isAlreadySent = existingMatch.status === 'SENT' || !!existingMatch.sent_at || (existingMatch.follow_up_step && existingMatch.follow_up_step > 0);
        
        existingList.push({
          ...lead,
          dbId: existingMatch.id,
          dbStatus: existingMatch.status,
          dbCompanyName: existingMatch.company_name,
          sentAt: existingMatch.sent_at,
          lastContactedAt: existingMatch.last_contacted_at,
          followUpStep: existingMatch.follow_up_step || 0,
          followUpStepLabel: getFollowUpStepLabel(existingMatch.follow_up_step, existingMatch.status),
          relativeTime: formatRelativeTime(existingMatch.last_contacted_at || existingMatch.sent_at || existingMatch.created_at),
          emailSubject: existingMatch.email_subject,
          isAlreadySent
        });
        return;
      }

      // B. Run 360-Degree Comprehensive Verification with 6.5s Hobby Tier Timeout Guard
      let timer: any;
      const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(() => {
          resolve({
            isEligibleToSave: false,
            blockReason: 'Probe exceeded timeout guard (Vercel Hobby Protection)',
            website: { isLive: false, statusCode: 0, errorReason: 'Timeout' },
            email: { isValid: false, verifier: 'Timeout Guard', isCatchAll: false, deliverabilityScore: 0, bounceRisk: 'HIGH', reason: 'Probe timed out' },
            linkedin: { exists: false, status: 'UNKNOWN' },
            overallScore: 0
          });
        }, 6500);
      });

      const actualVerification = verifyLeadComprehensive({
        websiteUrl: lead.websiteUrl,
        email: lead.email,
        linkedinUrl: lead.linkedinUrl,
        founderName: lead.founderName,
        companyName: lead.companyName
      }).then((res) => {
        clearTimeout(timer);
        return res;
      });

      let report: any = await Promise.race([actualVerification, timeoutPromise]);

      let currentLead = lead;
      let autoHealed = { website: false, linkedin: false, email: false, founder: false };
      let originalData = { 
        websiteUrl: lead.websiteUrl, 
        linkedinUrl: lead.linkedinUrl, 
        email: lead.email, 
        founderName: lead.founderName 
      };

      // If any attribute failed (website dead, email undeliverable/bounced, or linkedin not found/missing), trigger Auto-Heal!
      const needsHeal = !report.isEligibleToSave || 
        !report.linkedin?.exists || 
        report.linkedin?.status === 'NOT_FOUND' || 
        report.linkedin?.status === 'INVALID_URL' || 
        !currentLead.linkedinUrl;

        if (needsHeal) {
          try {
            const healResult = await autoHealLeadComprehensive(currentLead, report);
            currentLead = healResult.healedLead;
            report = healResult.report;
            autoHealed = healResult.autoHealed;
            originalData = healResult.originalData;
          } catch (healErr: any) {
            console.warn(`[Auto-Heal Error for ${lead.companyName}]:`, healErr?.message || healErr);
          }
        }

        const wasAnyHealed = autoHealed.website || autoHealed.linkedin || autoHealed.email || autoHealed.founder;

        if (report.isEligibleToSave) {
          verifiedList.push({
            ...currentLead,
            verifier: report.email.verifier,
            isCatchAll: report.email.isCatchAll,
            deliverabilityScore: report.email.deliverabilityScore,
            bounceRisk: report.email.bounceRisk,
            websiteStatus: report.website.isLive ? 'LIVE' : 'DEAD',
            websiteStatusCode: report.website.statusCode,
            linkedinStatus: report.linkedin.status,
            linkedinUrl: report.linkedin.url || currentLead.linkedinUrl,
            overallScore: report.overallScore,
            autoHealed,
            wasAnyHealed,
            originalData
          });
        } else {
          invalidList.push({
            ...currentLead,
            reason: report.blockReason || 'Failed verification gate (Auto-heal could not find working inbox/site)',
            websiteStatus: report.website.isLive ? 'LIVE' : 'DEAD',
            websiteError: report.website.errorReason,
            emailError: report.email.reason,
            linkedinStatus: report.linkedin.status,
            bounceRisk: report.email.bounceRisk,
            autoHealed,
            wasAnyHealed,
            originalData
          });
        }
      }));

    const autoHealedTotal = verifiedList.filter(v => v.wasAnyHealed).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalUploaded: mappedRows.length,
        verifiedCount: verifiedList.length,
        autoHealedCount: autoHealedTotal,
        existingCount: existingList.length,
        alreadySentCount: existingList.filter(e => e.isAlreadySent).length,
        invalidCount: invalidList.length
      },
      verified: verifiedList,
      existing: existingList,
      invalid: invalidList
    });
  } catch (error: any) {
    console.error('[CSV Verify API Error]:', error);
    return NextResponse.json({ error: error.message || 'Verification process failed.' }, { status: 500 });
  }
}
