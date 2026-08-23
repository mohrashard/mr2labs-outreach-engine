import { NextResponse } from 'next/server';
import { generateAuditPdf } from '@/lib/pdf/generate';
import { runTechnicalAudit } from '@/lib/scraper/audit';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain') || 'https://mr2labs.com';
    const isTechnical = searchParams.get('tech') === 'true';
    
    // Fetch HTML
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`;
    const response = await fetch(urlStr);
    const html = await response.text();

    // 1. Run live audit
    const auditData = await runTechnicalAudit(urlStr, html, response.headers);
    
    // 2. Generate PDF
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const companyName = cleanDomain.split('.')[0];
    const capitalizedCompany = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    const pdfBuffer = await generateAuditPdf(capitalizedCompany, cleanDomain, auditData, isTechnical);
    
    // 3. Return as PDF stream
    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="audit-${domain.replace(/^https?:\/\//, '')}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('PDF Test Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
