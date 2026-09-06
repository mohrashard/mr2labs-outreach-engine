import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendColdEmail } from '@/lib/email/resend';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;

    // 1. Fetch lead
    const { data: lead, error: fetchErr } = await supabaseAdmin
      .from('outreach_leads')
      .select('id, email, company_name, website_url, email_subject')
      .eq('id', id)
      .single();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no valid email address' }, { status: 400 });
    }

    let cleanCompany = lead.company_name
      ? lead.company_name.trim().replace(/[,.]?\s*\b(llc|inc|corp|corporation|ltd|co|pc|pllc|group|holdings)\b\.?/gi, '').replace(/[,.]\s*$/, '').trim()
      : 'your team';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://outreach.getmr2labs.com';
    const auditUrl = `${appUrl}/audit/${id}`;
    const subject = `2-minute video breakdown for ${cleanCompany}`;

    const htmlContent = `
      <div style="font-family: sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px;">
        <p style="margin: 0 0 16px 0;">Hi,</p>
        <p style="margin: 0 0 16px 0;">Here is the 2-minute Loom breakdown I put together for <strong>${cleanCompany}</strong>:</p>
        <p style="margin: 20px 0;">
          <a href="${auditUrl}" style="color: #2563eb; font-weight: 600; text-decoration: underline;">Watch the 2-minute Loom breakdown for ${cleanCompany} &rarr;</a>
        </p>
        <p style="margin: 16px 0 0 0;">Let me know what you think!</p>
        <p style="margin: 20px 0 0 0;">Best,<br/>Rashard</p>
      </div>
    `;

    const textContent = `Hi,\n\nHere is the 2-minute Loom breakdown I put together for ${cleanCompany}:\n${auditUrl}\n\nLet me know what you think!\n\nBest,\nRashard`;

    // 2. Send via Resend
    await sendColdEmail(lead.email, subject, htmlContent, textContent);

    const nowIso = new Date().toISOString();

    // 3. Update status in outreach_leads
    await supabaseAdmin
      .from('outreach_leads')
      .update({
        status: 'SENT',
        reply_status: 'POSITIVE',
        last_contacted_at: nowIso,
      })
      .eq('id', id);

    // 4. Log event
    await supabaseAdmin.from('activity_logs').insert({
      lead_id: id,
      event_type: 'AUDIT_LINK_SENT',
      payload: { audit_url: auditUrl, sent_at: nowIso },
    });

    return NextResponse.json({
      success: true,
      message: `Audit link email sent successfully to ${lead.email}!`,
      audit_url: auditUrl,
    });
  } catch (err: any) {
    console.error('[SEND AUDIT API ERROR]:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
