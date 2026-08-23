import dns from 'dns';
import * as cheerio from 'cheerio';

export interface AuditResult {
  // Business Workflows
  has_scheduler: boolean;
  has_mailto_trap: boolean;
  has_pdf_downloads: boolean;
  has_live_chat: boolean;

  // Security & Infrastructure
  dmarc_missing: boolean;
  spf_missing: boolean;
  has_shared_hosting_mx: boolean;
  caa_missing: boolean;

  // HTTP Security Headers
  hsts_missing: boolean;
  clickjacking_vulnerable: boolean; // X-Frame-Options missing
  csp_missing: boolean;
  legacy_server_headers: string | null; // e.g. "Express", "Apache"

  // Performance & Bloat
  script_count: number;
  has_wp_plugins: boolean;
  hydration_bloat_kb: number;
  html_size_kb: number;
  has_tracker_bloat: boolean;

  // CDN & Assets
  has_unoptimized_images: boolean;
  missing_lazy_loading: boolean;
  missing_cache_headers: boolean;

  // PWA & Mobile
  has_pwa_manifest: boolean;

  // SEO & Social
  missing_opengraph: boolean;
  missing_alt_text_count: number;
  missing_meta_description: boolean;
  broken_heading_hierarchy: boolean;
  missing_mobile_autocomplete: boolean;
}

function getBaseDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return host;
  } catch {
    return url;
  }
}

async function checkDnsRecords(domain: string) {
  const result = {
    dmarc_missing: true,
    spf_missing: true,
    has_shared_hosting_mx: true,
    caa_missing: true,
  };

  try {
    // Check SPF
    try {
      const txtRecords = await dns.promises.resolveTxt(domain);
      for (const record of txtRecords) {
        if (record.join('').includes('v=spf1')) {
          result.spf_missing = false;
        }
      }
    } catch {}

    // Check DMARC
    try {
      const dmarcRecords = await dns.promises.resolveTxt(`_dmarc.${domain}`);
      for (const record of dmarcRecords) {
        if (record.join('').includes('v=DMARC1')) {
          result.dmarc_missing = false;
        }
      }
    } catch {}

    // Check MX (Enterprise vs Shared)
    try {
      const mxRecords = await dns.promises.resolveMx(domain);
      for (const mx of mxRecords) {
        const exchange = mx.exchange.toLowerCase();
        if (exchange.includes('google.com') || exchange.includes('outlook.com') || exchange.includes('microsoft.com') || exchange.includes('pphosted.com') || exchange.includes('mimecast.com')) {
          result.has_shared_hosting_mx = false;
        }
      }
    } catch {}

    // Check CAA
    try {
      const caaRecords = await dns.promises.resolveCaa(domain);
      if (caaRecords && caaRecords.length > 0) {
        result.caa_missing = false;
      }
    } catch {}
  } catch (err) {
    console.warn(`[Audit DNS] Failed to check DNS for ${domain}`);
  }

  return result;
}

export async function runTechnicalAudit(url: string, html: string, headers: Headers): Promise<AuditResult> {
  const $ = cheerio.load(html);
  const domain = getBaseDomain(url);
  const lowerHtml = html.toLowerCase();
  
  // 1. Business Workflow Detection
  const has_scheduler = lowerHtml.includes('calendly.com') || lowerHtml.includes('cal.com') || lowerHtml.includes('acuityscheduling.com') || $('iframe[src*="calendly"], iframe[src*="acuity"]').length > 0;
  const has_mailto_trap = $('a[href^="mailto:"]').length > 0;
  const has_pdf_downloads = $('a[href$=".pdf"]').length > 0;
  const has_live_chat = lowerHtml.includes('intercom') || lowerHtml.includes('zendesk') || lowerHtml.includes('drift');

  // 2. DNS Checks
  const dnsChecks = await checkDnsRecords(domain);

  // 3. HTTP Headers
  const hsts_missing = !headers.get('strict-transport-security');
  const clickjacking_vulnerable = !headers.get('x-frame-options');
  const csp_missing = !headers.get('content-security-policy');
  
  const serverHeader = headers.get('server');
  const xPoweredBy = headers.get('x-powered-by');
  const legacy_server_headers = (serverHeader || xPoweredBy) ? `${serverHeader || ''} ${xPoweredBy || ''}`.trim() : null;

  // 4. Legacy CMS & Bloat
  const script_count = $('script').length;
  const has_wp_plugins = lowerHtml.includes('wp-content/plugins/');
  
  const html_size_kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  let hydration_bloat_kb = 0;
  const nextData = $('#__NEXT_DATA__, #__NUXT_DATA__');
  if (nextData.length > 0) {
    hydration_bloat_kb = Math.round(Buffer.byteLength(nextData.html() || '', 'utf8') / 1024);
  }

  const has_tracker_bloat = lowerHtml.includes('fbevents.js') || lowerHtml.includes('googletagmanager.com') || lowerHtml.includes('hotjar.com') || lowerHtml.includes('tiktok.com');

  // 5. Assets & Media
  const has_unoptimized_images = $('img[src$=".png"], img[src$=".jpg"]').length > 0;
  const missing_lazy_loading = $('img:not([loading="lazy"])').length > 5; // allow a few above fold
  
  // Cache check (Optional: Do a HEAD request to the first CSS/JS)
  let missing_cache_headers = true;
  const firstAsset = $('link[rel="stylesheet"], script[src]').attr('href') || $('script[src]').attr('src');
  if (firstAsset) {
    try {
      const assetUrl = firstAsset.startsWith('http') ? firstAsset : new URL(firstAsset, url).href;
      const headRes = await fetch(assetUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      const cacheControl = headRes.headers.get('cache-control');
      if (cacheControl && (cacheControl.includes('immutable') || cacheControl.includes('max-age=31536000'))) {
        missing_cache_headers = false;
      }
    } catch {}
  }

  // 6. PWA / Mobile
  const has_pwa_manifest = $('link[rel="manifest"]').length > 0;

  // 7. OpenGraph
  const missing_opengraph = !$('meta[property="og:image"]').length || !$('meta[property="og:title"]').length || !$('meta[name="twitter:card"]').length;

  // 8. ADA & SEO
  const missing_alt_text_count = $('img:not([alt])').length;
  const missing_meta_description = !$('meta[name="description"]').length;
  const broken_heading_hierarchy = $('h1').length > 1 || ($('h2').length > 0 && $('h1').length === 0);
  
  // 9. Form UX
  const missing_mobile_autocomplete = $('input[type="text"], input[type="email"], input[type="tel"]').not('[autocomplete]').length > 0;

  return {
    has_scheduler,
    has_mailto_trap,
    has_pdf_downloads,
    has_live_chat,
    ...dnsChecks,
    hsts_missing,
    clickjacking_vulnerable,
    csp_missing,
    legacy_server_headers,
    script_count,
    has_wp_plugins,
    hydration_bloat_kb,
    html_size_kb,
    has_tracker_bloat,
    has_unoptimized_images,
    missing_lazy_loading,
    missing_cache_headers,
    has_pwa_manifest,
    missing_opengraph,
    missing_alt_text_count,
    missing_meta_description,
    broken_heading_hierarchy,
    missing_mobile_autocomplete
  };
}
