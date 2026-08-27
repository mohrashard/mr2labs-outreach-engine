import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let domain = searchParams.get('domain') || 'target-domain.com';
    const time = searchParams.get('time') || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    try {
      domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    } catch (e) {
      // leave as is
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0E0E0F',
            border: '1px solid #27272A',
            padding: 0,
            margin: 0,
          }}
        >
          {/* Title Bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#1C1C1F',
              height: '36px',
              paddingLeft: '16px',
              paddingRight: '16px',
              borderBottom: '1px solid #27272A',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF5F56', display: 'flex' }} />
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFBD2E', display: 'flex' }} />
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#27C93F', display: 'flex' }} />
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                color: '#71717A',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              mr2labs-forensic-engine ~ bash
            </div>
          </div>

          {/* Terminal Output */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 30px',
              gap: '8px',
              fontFamily: 'monospace',
              fontSize: '14px',
              flex: 1,
            }}
          >
            <div style={{ display: 'flex', color: '#10B981', fontWeight: 'bold' }}>
              {`root@mr2labs:~# analyze --target ${domain}`}
            </div>
            <div style={{ display: 'flex', color: '#A1A1AA', marginTop: '12px' }}>
              Initializing forensic sequence...
            </div>
            <div style={{ display: 'flex', color: '#A1A1AA' }}>
              Scanning frontend architecture and DNS configuration...
            </div>
            
            <div style={{ display: 'flex', color: '#EF4444', fontWeight: 'bold', marginTop: '16px' }}>
              [✖] CRITICAL: Severe Vulnerabilities & Conversion Leaks Detected
            </div>
            <div style={{ display: 'flex', color: '#F59E0B', fontWeight: 'bold' }}>
              [!] WARNING: Immediate Remediation Recommended
            </div>

            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '1px',
                backgroundColor: '#2A2A2E',
                marginTop: '20px',
                marginBottom: '16px',
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', color: '#F4F4F5', fontWeight: 'bold' }}>
                {`>> Scan completed at ${time}`}
              </div>
              <div style={{ display: 'flex', color: '#3B82F6', fontWeight: 'bold' }}>
                CLICK TO VIEW FULL PDF REPORT ➔
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 600,
        height: 300,
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch (err: any) {
    console.error('[Thumbnail API Error]:', err);
    return new Response(`Failed to generate thumbnail: ${err.message}`, { status: 500 });
  }
}
