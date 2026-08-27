import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let domain = searchParams.get('domain') || 'target-domain.com';

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
            backgroundColor: '#09090B',
            border: '1px solid #27272A',
            padding: 0,
            margin: 0,
            fontFamily: 'sans-serif',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#18181B',
              height: '42px',
              paddingLeft: '16px',
              paddingRight: '16px',
              borderBottom: '1px solid #27272A',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', display: 'flex' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B', display: 'flex' }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', display: 'flex' }} />
              <div style={{ display: 'flex', color: '#A1A1AA', fontSize: '11px', fontWeight: 600, marginLeft: '6px' }}>
                Mr² Labs • Diagnostic Audit
              </div>
            </div>
            <div style={{ display: 'flex', color: '#3B82F6', fontSize: '12px', fontWeight: 700 }}>
              {domain}
            </div>
          </div>

          {/* Body Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 24px',
              gap: '12px',
              flex: 1,
            }}
          >
            {/* Title & Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', color: '#FAFAFA', fontSize: '17px', fontWeight: 700 }}>
                {`Audit Findings for ${domain}`}
              </div>
              <div style={{ display: 'flex', color: '#A1A1AA', fontSize: '12px' }}>
                Automated technical scan detected 2 issues affecting security & lead conversion:
              </div>
            </div>

            {/* Findings List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
              {/* Finding 1 */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#18181B',
                  border: '1px solid #27272A',
                  borderRadius: 6,
                  padding: '8px 12px',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', color: '#EF4444', fontSize: '12px', fontWeight: 700 }}>
                    🔴 Security
                  </div>
                  <div style={{ display: 'flex', color: '#E4E4E7', fontSize: '12px' }}>
                    Domain protection incomplete (DMARC missing)
                  </div>
                </div>
                <div style={{ display: 'flex', color: '#EF4444', fontSize: '11px', fontWeight: 700 }}>
                  High Risk
                </div>
              </div>

              {/* Finding 2 */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#18181B',
                  border: '1px solid #27272A',
                  borderRadius: 6,
                  padding: '8px 12px',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', color: '#F59E0B', fontSize: '12px', fontWeight: 700 }}>
                    🟡 Automation
                  </div>
                  <div style={{ display: 'flex', color: '#E4E4E7', fontSize: '12px' }}>
                    No 24/7 automated booking or lead intake system
                  </div>
                </div>
                <div style={{ display: 'flex', color: '#F59E0B', fontSize: '11px', fontWeight: 700 }}>
                  Losing Leads
                </div>
              </div>
            </div>

            {/* CTA Button Bar */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'auto',
              }}
            >
              <div style={{ display: 'flex', color: '#71717A', fontSize: '11px' }}>
                Full 1-Page PDF Executive Summary Ready
              </div>
              <div
                style={{
                  display: 'flex',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '7px 14px',
                  borderRadius: 5,
                }}
              >
                VIEW FULL PDF REPORT ➔
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
