import * as cheerio from 'cheerio';
import dns from 'dns/promises';
import { isValidLeadEmail } from './utils';

export interface ScrapeResult {
  hasValidMx: boolean;
  emails: string[];
  phones: string[];
  whatsappLinks: string[];
  instagramLinks: string[];
  linkedinLinks: string[];
  hasContactForm: boolean;
  screenshotUrl: string;
}

async function checkMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records && records.length > 0;
  } catch (error) {
    return false; // Domain invalid or no MX records
  }
}

export async function deepScrapeSite(domainUrl: string): Promise<ScrapeResult> {
  let urlObj: URL;
  try {
    urlObj = new URL(domainUrl.startsWith('http') ? domainUrl : `https://${domainUrl}`);
  } catch (error) {
    throw new Error(`Invalid URL provided: ${domainUrl}`);
  }

  const domain = urlObj.hostname.replace(/^www\./, '');
  
  // Verify MX Records to validate domain
  const hasValidMx = await checkMxRecords(domain);
  
  const result: ScrapeResult = {
    hasValidMx,
    emails: [],
    phones: [],
    whatsappLinks: [],
    instagramLinks: [],
    linkedinLinks: [],
    hasContactForm: false,
    screenshotUrl: `https://api.microlink.io?url=${encodeURIComponent(urlObj.toString())}&screenshot=true`
  };

  const paths = ['/', '/contact', '/about-us', '/team', '/privacy-policy'];
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailsSet = new Set<string>();
  const phonesSet = new Set<string>();
  const whatsappSet = new Set<string>();
  const instagramSet = new Set<string>();
  const linkedinSet = new Set<string>();

  for (const path of paths) {
    const targetUrl = new URL(path, urlObj.origin).toString();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract emails from body text
      const bodyText = $('body').text();
      const textEmails = bodyText.match(emailRegex);
      if (textEmails) {
        textEmails.forEach(e => {
          if (isValidLeadEmail(e)) {
            emailsSet.add(e.toLowerCase());
          }
        });
      }

      // Check for <form> elements as fallback
      if ($('form').length > 0) {
        result.hasContactForm = true;
      }

      // Extract links
      $('a').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const hrefLower = href.toLowerCase();

        // mailto: links
        if (hrefLower.startsWith('mailto:')) {
          const email = hrefLower.replace('mailto:', '').split('?')[0].trim();
          if (isValidLeadEmail(email)) {
            emailsSet.add(email);
          }
        }

        // tel: links
        if (hrefLower.startsWith('tel:')) {
          phonesSet.add(href.replace('tel:', '').trim());
        }

        // WhatsApp links
        if (hrefLower.includes('wa.me/') || hrefLower.includes('api.whatsapp.com/')) {
          whatsappSet.add(href);
        }

        // Instagram links
        if (hrefLower.includes('instagram.com/')) {
          instagramSet.add(href);
        }

        // LinkedIn links
        if (hrefLower.includes('linkedin.com/')) {
          linkedinSet.add(href);
        }
      });
    } catch (error) {
      // It's common for some sub-pages to not exist or timeout, we just continue
      console.warn(`[Scraper] Failed to scrape path ${targetUrl}`);
    }
  }

  result.emails = Array.from(emailsSet);
  result.phones = Array.from(phonesSet);
  result.whatsappLinks = Array.from(whatsappSet);
  result.instagramLinks = Array.from(instagramSet);
  result.linkedinLinks = Array.from(linkedinSet);

  return result;
}
