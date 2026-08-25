export interface PsiMetrics {
  score: number;
  lcp: string;
  tbt: string;
  cls: string;
  isFailingCoreWebVitals: boolean;
}

export async function fetchGooglePageSpeed(url: string): Promise<PsiMetrics | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    url
  )}&strategy=MOBILE&category=PERFORMANCE${apiKey ? `&key=${apiKey}` : ''}`;

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const data = await res.json();
    const lighthouse = data.lighthouseResult;
    const score = Math.round((lighthouse.categories.performance.score || 0) * 100);
    const lcp = lighthouse.audits['largest-contentful-paint']?.displayValue || 'N/A';
    const tbt = lighthouse.audits['total-blocking-time']?.displayValue || 'N/A';
    const cls = lighthouse.audits['cumulative-layout-shift']?.displayValue || 'N/A';

    return {
      score,
      lcp,
      tbt,
      cls,
      isFailingCoreWebVitals: score < 50,
    };
  } catch (err) {
    console.warn('[PSI Audit Warning] Failed to fetch PageSpeed metrics:', err);
    return null;
  }
}
