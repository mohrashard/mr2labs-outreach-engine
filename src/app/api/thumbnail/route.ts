import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let domain = searchParams.get('domain') || 'target-domain.com';
  const time = searchParams.get('time') || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Clean domain if they pass a full URL
  try {
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  } catch (e) {
    // leave as is
  }

  // We generate a sleek, MacOS-style terminal window in pure SVG
  // This costs $0 to generate and forces a massive CTR because the founder sees their own domain "hacked" / analyzed.
  const svg = `
    <svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
      <style>
        .text { font-family: 'Courier New', Courier, monospace; font-size: 14px; }
        .bold { font-weight: bold; }
        .red { fill: #EF4444; }
        .green { fill: #10B981; }
        .yellow { fill: #F59E0B; }
        .gray { fill: #A1A1AA; }
        .white { fill: #F4F4F5; }
        .blue { fill: #3B82F6; }
      </style>
      
      <!-- Window Background -->
      <rect width="600" height="300" fill="#0E0E0F" rx="8" />
      
      <!-- Title Bar -->
      <rect width="600" height="36" fill="#1C1C1F" rx="8" />
      <path d="M 0 28 L 600 28 L 600 36 L 0 36 Z" fill="#1C1C1F" />
      <circle cx="20" cy="18" r="6" fill="#FF5F56" />
      <circle cx="40" cy="18" r="6" fill="#FFBD2E" />
      <circle cx="60" cy="18" r="6" fill="#27C93F" />
      <text x="300" y="23" fill="#71717A" class="text" font-size="12px" text-anchor="middle">mr2labs-forensic-engine ~ bash</text>
      
      <!-- Terminal Output -->
      <text x="30" y="80" class="text green bold">root@mr2labs:~# analyze --target ${domain}</text>
      
      <text x="30" y="115" class="text gray">Initializing forensic sequence...</text>
      <text x="30" y="140" class="text gray">Scanning frontend architecture and DNS configuration...</text>
      
      <text x="30" y="180" class="text red bold">[✖] CRITICAL: Severe Vulnerabilities & Conversion Leaks Detected</text>
      <text x="30" y="205" class="text yellow bold">[!] WARNING: Immediate Remediation Recommended</text>
      
      <!-- Divider -->
      <rect x="30" y="235" width="540" height="1" fill="#2A2A2E" />
      
      <!-- CTA -->
      <text x="30" y="265" class="text white bold">>> Scan completed at ${time}</text>
      <text x="300" y="265" class="text blue bold" text-decoration="underline">CLICK ATTACHMENT TO VIEW FULL PDF REPORT ➔</text>
    </svg>
  `;

  // Return the SVG with aggressive caching so it loads instantly in the email client
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
