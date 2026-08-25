import { NextResponse } from 'next/server';
import { generateAuditPdf } from '@/lib/pdf/generate';
import { runTechnicalAudit } from '@/lib/scraper/audit';
import { fetchGooglePageSpeed } from '@/lib/scraper/pagespeed';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain') || 'https://mr2labs.com';
    const isTechnical = searchParams.get('tech') === 'true';
    
    // Fetch HTML
    const urlStr = domain.startsWith('http') ? domain : `https://${domain}`;
    const response = await fetch(urlStr);
    const html = await response.text();


    // 1. Run live audit and PSI in parallel
    const [auditData, psiResult] = await Promise.all([
      runTechnicalAudit(urlStr, html, response.headers),
      fetchGooglePageSpeed(urlStr)
    ]);
    
    // Inject PSI data
    const finalAuditData: Record<string, any> = { ...auditData };
    if (psiResult) {
      finalAuditData.psi_score = psiResult.score;
      finalAuditData.psi_lcp = psiResult.lcp;
      finalAuditData.psi_tbt = psiResult.tbt;
      finalAuditData.psi_cls = psiResult.cls;
    }
    
    // 2. Generate PDF
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const companyName = cleanDomain.split('.')[0];
    const capitalizedCompany = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    const pdfBuffer = await generateAuditPdf(capitalizedCompany, cleanDomain, finalAuditData, isTechnical);
    
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
