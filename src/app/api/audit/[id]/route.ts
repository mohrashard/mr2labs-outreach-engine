import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateAuditPdf } from '@/lib/pdf/generate';

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

    // 1. Fetch the raw audit data
    const { data: lead, error } = await supabase
      .from('outreach_leads')
      .select('company_name, website_url, raw_scraped_data, campaigns ( niche )')
      .eq('id', id)
      .single();

    if (error || !lead) {
      return new NextResponse('Audit report not found or expired.', { status: 404 });
    }

    // 2. Track the open event in background without blocking response
    supabase
      .from('outreach_leads')
      .update({ audit_opened_at: new Date().toISOString() })
      .eq('id', id)
      .then(() => console.log(`[AUDIT] Tracked open for lead ${id}`));

    // 3. Prepare Domain
    let cleanDomain = lead.website_url;
    try {
      const urlObj = new URL(lead.website_url.startsWith('http') ? lead.website_url : `https://${lead.website_url}`);
      cleanDomain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      console.warn(`Could not parse URL ${lead.website_url}`);
    }

    // 4. Generate PDF on the fly
    const pdfBuffer = await generateAuditPdf(
      lead.company_name,
      cleanDomain,
      lead.raw_scraped_data || {},
      false, // isTechnical
      Array.isArray(lead.campaigns) ? lead.campaigns[0]?.niche : (lead.campaigns as any)?.niche
    );

    // 5. Stream back
    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${cleanDomain}_MR2Labs_Audit.pdf"`,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });

  } catch (err) {
    console.error('[PDF Streaming Error]:', err);
    return new NextResponse('Internal Server Error while generating report.', { status: 500 });
  }
}
