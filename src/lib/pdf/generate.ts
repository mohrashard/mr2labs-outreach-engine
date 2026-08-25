import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { DiagnosticDashboard } from './DiagnosticDashboard';

export async function generateAuditPdf(
  companyName: string,
  domain: string,
  auditData: Record<string, any>,
  isTechnical: boolean = false,
  nicheInput?: string
): Promise<Buffer> {
  // Use React.createElement directly since this is a .ts file
  const pdfElement = React.createElement(DiagnosticDashboard, {
    companyName,
    domain,
    auditData,
    isTechnical,
    nicheInput,
  });
  
  // Cast to any to bypass the strict DocumentProps type requirement in renderToBuffer
  const buffer = await renderToBuffer(pdfElement as any);
  
  return buffer;
}
