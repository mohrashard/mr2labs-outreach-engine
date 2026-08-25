import dns from 'dns';
import * as cheerio from 'cheerio';

export interface AuditResult {
  // Business Workflows
  has_scheduler: boolean;
  has_mailto_trap: boolean;
  has_pdf_downloads: boolean;
  has_live_chat: boolean;
  has_crm: boolean;
  has_email_auto: boolean;
  has_analytics: boolean;
  has_payment: boolean;
  has_whatsapp_stack: boolean;
  missing_whatsapp: boolean;
  missing_live_chat: boolean;
  missing_crm: boolean;
  missing_scheduler: boolean;
  missing_email_automation: boolean;
  is_diy_subdomain: boolean;

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
  
  let payload = html;
  
  // The GTM Buster: Look for Google Tag Manager and fetch its payload
  const gtmMatch = payload.match(/GTM-[A-Z0-9]+/i);
  if (gtmMatch) {
    try {
      const gtmRes = await fetch(`https://www.googletagmanager.com/gtm.js?id=${gtmMatch[0]}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(5000)
      });
      if (gtmRes.ok) {
        const gtmScript = await gtmRes.text();
        payload += `\n${gtmScript}`;
      }
    } catch (e) {
      console.warn(`[GTM Buster] Failed to fetch GTM payload for ${domain}`);
    }
  }

  // 1. Business Workflow Detection (HTML + GTM Payload)
  const has_whatsapp_stack = /wa\.me|whatsapp\.com\/send|wati\.io/i.test(payload);
  const has_live_chat = /tidio|crisp\.chat|intercom|tawk\.to|freshchat|zendesk|drift/i.test(payload);
  const has_crm = /hs-scripts\.com|zohocrm|pipedrive|salesforce/i.test(payload);
  const has_email_auto = /list-manage\.com|activecampaign|klaviyo|mailerlite/i.test(payload);
  const has_analytics = /gtag|fbq\(|google-analytics|clarity\.ms/i.test(payload);
  const has_scheduler = /calendly|cal\.com|acuityscheduling|tidycal/i.test(payload) || $('iframe[src*="calendly"], iframe[src*="acuity"]').length > 0;
  const has_payment = /stripe\.com|paypal\.com|paddle\.com/i.test(payload);

  const has_mailto_trap = $('a[href^="mailto:"]').length > 0;
  const has_pdf_downloads = $('a[href$=".pdf"]').length > 0;

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
  const lowerPayload = payload.toLowerCase();
  const has_wp_plugins = lowerPayload.includes('wp-content/plugins/');
  
  const html_size_kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  let hydration_bloat_kb = 0;
  const nextData = $('#__NEXT_DATA__, #__NUXT_DATA__');
  if (nextData.length > 0) {
    hydration_bloat_kb = Math.round(Buffer.byteLength(nextData.html() || '', 'utf8') / 1024);
  }

  const has_tracker_bloat = lowerPayload.includes('fbevents.js') || lowerPayload.includes('googletagmanager.com') || lowerPayload.includes('hotjar.com') || lowerPayload.includes('tiktok.com');

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
    has_crm,
    has_email_auto,
    has_analytics,
    has_payment,
    has_whatsapp_stack,
    missing_whatsapp: !has_whatsapp_stack,
    missing_live_chat: !has_live_chat,
    missing_crm: !has_crm,
    missing_scheduler: !has_scheduler,
    missing_email_automation: !has_email_auto,
    is_diy_subdomain: domain.includes('wixsite.com') || domain.includes('carrd.co') || domain.includes('weebly.com') || domain.includes('squarespace.com') || lowerPayload.includes('powered by wordpress'),
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
