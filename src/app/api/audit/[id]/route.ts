import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAuditPdf } from '@/lib/pdf/generate';
import { normalizeAuditData, categorizeAuditIssues, buildSolutionCards } from '@/lib/audit/rules';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    // 1. Fetch lead from Supabase
    const { data: lead, error } = await supabase
      .from('outreach_leads')
      .select('id, company_name, website_url, email, audit_data, raw_scraped_data, campaigns ( niche )')
      .eq('id', id)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: 'Audit report not found or expired.' }, { status: 404 });
    }

    // 2. Track engagement in background (audit_open_count, audit_opened_at, status, activity_logs)
    const nowIso = new Date().toISOString();
    (async () => {
      try {
        const { data: currentLead } = await supabase
          .from('outreach_leads')
          .select('status, audit_open_count')
          .eq('id', id)
          .single();

        if (currentLead) {
          const newOpens = Math.max(currentLead.audit_open_count || 0, 1);
          const newStatus = ['NEW', 'QUEUED', 'SENT', 'OPENED'].includes(currentLead.status) ? 'CLICKED' : currentLead.status;

          await supabase
            .from('outreach_leads')
            .update({
              audit_opened_at: nowIso,
              audit_open_count: newOpens,
              status: newStatus
            })
            .eq('id', id);

          await supabase.from('activity_logs').insert([
            {
              lead_id: id,
              event_type: 'MAGIC_LINK_CLICK',
              payload: { type: 'AUDIT_PAGE_VIEW', received_at: nowIso }
            },
            {
              lead_id: id,
              event_type: 'EMAIL_OPENED',
              payload: { type: 'INFERRED_FROM_AUDIT_VIEW', received_at: nowIso }
            }
          ]);
        }
      } catch (err) {
        console.error('[AUDIT TRACK ERROR]', err);
      }
    })();

    // 3. Extract Clean Domain
    let cleanDomain = lead.website_url;
    try {
      const urlObj = new URL(lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`);
      cleanDomain = urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
      console.warn(`Could not parse URL ${lead.website_url}`);
    }

    // 4. If JSON explicitly requested by the landing page
    if (format === 'json') {
      const auditData = normalizeAuditData(lead);
      const issues = categorizeAuditIssues(auditData);
      const solutions = buildSolutionCards(issues.critical, issues.moderate);

      return NextResponse.json({
        success: true,
        lead: {
          id: lead.id,
          company_name: lead.company_name,
          website_url: lead.website_url,
          domain: cleanDomain,
          email: lead.email || '',
        },
        audit_data: auditData,
        issues,
        solutions,
      });
    }

    // 5. DEFAULT: Stream PDF (handles old email links)
    const pdfBuffer = await generateAuditPdf(
      lead.company_name,
      cleanDomain,
      lead.raw_scraped_data || {},
      false,
      Array.isArray(lead.campaigns) ? lead.campaigns[0]?.niche : (lead.campaigns as any)?.niche
    );

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${cleanDomain}_MR2Labs_Audit.pdf"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (err) {
    console.error('[API Audit Error]:', err);
    return NextResponse.json({ error: 'Internal Server Error while generating audit response.' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const leadId = resolvedParams.id;
    const body = await request.json();

    const { company_name, domain, email, contact_name, priority_notes } = body;

    // 1. Insert into audit_submissions
    const { error: subErr } = await supabase
      .from('audit_submissions')
      .insert({
        lead_id: leadId,
        company_name: company_name || 'Unknown',
        domain: domain || '',
        email: email || '',
        contact_name: contact_name || '',
        priority_notes: priority_notes || '',
      });

    if (subErr) {
      console.warn('[AUDIT SUBMIT] Warning inserting into audit_submissions:', subErr.message);
      // Fallback: update outreach_leads audit_notes if table is pending schema creation
      await supabase
        .from('outreach_leads')
        .update({
          audit_notes: priority_notes,
          status: 'REPLIED',
        })
        .eq('id', leadId);
    } else {
      // Mark lead status as REPLIED
      await supabase
        .from('outreach_leads')
        .update({ status: 'REPLIED' })
        .eq('id', leadId);
    }

    // 2. Trigger notification email to growth@getmr2labs.com
    try {
      const { sendColdEmail } = await import('@/lib/email/brevo');
      const emailSubject = `🔥 Audit Priority Submitted: ${company_name || domain}`;
      const emailBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #6366f1;">New Loom Video Request Submitted</h2>
          <p><strong>Company:</strong> ${company_name} (${domain})</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Contact Name:</strong> ${contact_name || 'N/A'}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <h3>Prospect's Priority Notes:</h3>
          <blockquote style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 0; font-style: italic;">
            "${priority_notes || 'No custom notes provided.'}"
          </blockquote>
          <p style="margin-top: 24px;">
            <a href="https://outreach.mr2labs.com/audit/${leadId}" style="background: #6366f1; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              View Lead Audit Page →
            </a>
          </p>
        </div>
      `;

      await sendColdEmail('growth@getmr2labs.com', emailSubject, emailBody);
    } catch (emailErr) {
      console.error('[AUDIT SUBMIT] Internal email notification failed:', emailErr);
    }

    // 3. Trigger automated confirmation email directly to prospect
    if (email) {
      try {
        const { sendColdEmail } = await import('@/lib/email/brevo');
        const prospectSubject = `We received your audit request for ${domain} — Mr² Labs`;
        const prospectBody = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
            <h2 style="color: #6366f1;">Your Audit Breakdown is on the Way!</h2>
            <p>Hi ${contact_name || company_name || 'there'},</p>
            <p>Thank you for submitting your custom priorities for <strong>${company_name || domain}</strong>.</p>
            <p>Our engineering team at Mr² Labs is reviewing your technical audit. We are preparing a personalized video breakdown focusing on your requested items:</p>
            <blockquote style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 16px 0; font-style: italic; color: #475569;">
              "${priority_notes || 'Full technical audit & optimization roadmap'}"
            </blockquote>
            <p>You will receive your custom Loom video walkthrough directly at <strong>${email}</strong> within 48 hours.</p>
            <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
              Best regards,<br />
              <strong>Rashard</strong><br />
              Mr² Labs Engineering
            </p>
          </div>
        `;

        await sendColdEmail(email, prospectSubject, prospectBody);
      } catch (prospectEmailErr) {
        console.error('[AUDIT SUBMIT] Prospect confirmation email failed:', prospectEmailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Submission received! We will send your custom Loom video within 48 hours.',
    });
  } catch (err) {
    console.error('[AUDIT SUBMIT Error]:', err);
    return NextResponse.json({ error: 'Failed to process audit submission.' }, { status: 500 });
  }
}


