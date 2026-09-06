/**
 * Email Formatter Utility
 * Guarantees clean greetings, replaces unparsed placeholders, and formats paragraphs consistently.
 */

export interface GreetingOptions {
  confidence?: number;
  niche?: string | null;
  industry?: string | null;
}

export function sanitizeGreetingAndBody(
  pitchText: string,
  founderName?: string | null,
  companyName?: string | null,
  options?: GreetingOptions | string
): string {
  if (!pitchText) return pitchText;

  const resolvedOptions: GreetingOptions = typeof options === 'string'
    ? { niche: options }
    : (options || {});

  // Clean company name (remove legal suffixes like LLC, Inc., Corp., etc. for natural conversational greeting)
  let cleanCompany = companyName ? companyName.trim() : '';
  cleanCompany = cleanCompany
    .replace(/[,.]?\s*\b(llc|inc|corp|corporation|ltd|co|pc|pllc|group|holdings)\b\.?/gi, '')
    .replace(/[,.]\s*$/, '')
    .trim();

  let firstName: string | null = null;
  const confidence = typeof resolvedOptions.confidence === 'number' 
    ? resolvedOptions.confidence 
    : (founderName ? 85 : 0);

  // Only use personal name if confidence >= 75 and not generic/placeholder
  if (founderName && founderName.trim() && confidence >= 75) {
    const raw = founderName.trim().replace(/^(dr\.|mr\.|mrs\.|ms\.)\s+/i, '').split(' ')[0];
    if (
      raw &&
      !['unknown', 'admin', 'contact', 'info', 'sales', 'support', 'team', 'n/a', 'none', 'null'].includes(raw.toLowerCase())
    ) {
      if (/^dr\.?\s+/i.test(founderName.trim())) {
        firstName = `Dr. ${raw}`;
      } else {
        firstName = raw;
      }
    }
  }

  // 100% Safe Handling Greeting Selection:
  const industry = (resolvedOptions.industry || resolvedOptions.niche || '').toLowerCase();
  let targetGreeting: string;
  if (firstName) {
    targetGreeting = `Hi ${firstName},`;
  } else if (industry.includes('medical') || industry.includes('clinic') || industry.includes('dent') || industry.includes('spa')) {
    targetGreeting = cleanCompany ? `Hi ${cleanCompany} clinical team,` : 'Hi clinical team,';
  } else if (industry.includes('law') || industry.includes('legal') || industry.includes('attorney')) {
    targetGreeting = cleanCompany ? `To the partners at ${cleanCompany},` : 'To the partners,';
  } else if (cleanCompany && cleanCompany.length > 2) {
    targetGreeting = `Hi ${cleanCompany} team,`;
  } else {
    targetGreeting = `Hi,`;
  }

  let cleaned = pitchText.trim();

  // 1. Check top greeting line
  const greetingRegex = /^(?:Hi\s+([^,\n\r]+)|To the partners(?: at ([^,\n\r]+))?),?/i;
  const match = cleaned.match(greetingRegex);

  if (match) {
    const matchedName = (match[1] || match[2] || '').trim();
    // Detect placeholders or corporate company names erroneously used as person names
    const isPlaceholder =
      !matchedName ||
      /^\[.*\]$/.test(matchedName) ||
      /first\s*name/i.test(matchedName) ||
      /company/i.test(matchedName) ||
      matchedName.toLowerCase() === 'owner' ||
      matchedName.toLowerCase() === 'founder';

    const isCorporate =
      /\b(inc|llc|ltd|co|corp|group|real estate|agency|services|clinic|dental|law|firm|holding|holdings|media|solutions|properties|realty|consulting|studio|labs)\b/i.test(
        matchedName
      );

    if (isPlaceholder || isCorporate || !firstName) {
      cleaned = cleaned.replace(greetingRegex, targetGreeting);
    } else if (firstName) {
      cleaned = cleaned.replace(greetingRegex, `Hi ${firstName},`);
    }
  } else if (!cleaned.toLowerCase().startsWith('hi')) {
    cleaned = `${targetGreeting}\n\n${cleaned}`;
  }

  // 2. Clean up any remaining bracket placeholders, code enums, and enforce correct company & sender names
  const teamFallback = cleanCompany ? `${cleanCompany} team` : 'there';
  cleaned = cleaned
    .replace(/\[First Name\]/gi, firstName || teamFallback)
    .replace(/\[Name\]/gi, firstName || teamFallback)
    .replace(/\[Company Name\]/gi, cleanCompany || 'your company')
    .replace(/\[Company\]/gi, cleanCompany || 'your company')
    .replace(/\bAI_AUTOMATION\b/g, 'AI lead automation')
    .replace(/\bWEBSITE_REBUILD\b/g, 'website redesign')
    .replace(/\bCUSTOM_SOFTWARE\b/g, 'custom software')
    .replace(/\bSECURITY_REMEDIATION\b/g, 'website security remediation')
    .replace(/\bPERFORMANCE\b/g, 'performance optimization')
    .replace(/\bWHITE_LABEL\b/g, 'white-label engineering')
    .replace(/\bMohamed\b/g, 'Rashard')
    .replace(/MR2 LABS/gi, 'Mr² Labs')
    .replace(/MR² LABS/gi, 'Mr² Labs')
    .replace(/Mr² Labs/g, 'Mr² Labs')
    .replace(/MR2 Labs/gi, 'Mr² Labs');

  // 3. Strictly eliminate em-dashes and en-dashes across the entire email body
  cleaned = cleaned.replace(/\s*[—–]\s*/g, ', ');

  return cleaned;
}

/**
 * Converts email text into HTML with explicit 16px bottom margins per paragraph.
 * Guarantees 100% consistent double-spaced formatting across all email clients (Gmail, Outlook, Apple Mail).
 */
export function formatPitchHtml(pitchText: string): string {
  if (!pitchText) return '';

  // Standardize line breaks
  const normalized = pitchText.replace(/\r\n/g, '\n').trim();

  // Split by double newlines (\n\n) or single newlines (\n) if no double newlines exist
  let paragraphs = normalized.split(/\n\s*\n/);
  if (paragraphs.length === 1 && normalized.includes('\n')) {
    paragraphs = normalized.split('\n').filter((p) => p.trim().length > 0);
  }

  return paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[-—–_]{2,}$/.test(p)) // Strip standalone dash dividers like ---
    .map((p) => {
      // Check if this paragraph contains the opt-out / breakdown footer
      if (/If you'd prefer not to hear from me/i.test(p)) {
        // Strip any leading dashes or markdown asterisks
        const cleanFooterText = p
          .replace(/^[-—–_]{2,}\s*/, '')
          .replace(/^\*\*|\*\*$/g, '')
          .replace(/\n/g, ' ')
          .trim();

        return `<p style="margin-top: 24px; margin-bottom: 0; font-size: 11px; font-weight: bold; color: #444444; border-top: 1px solid #eeeeee; padding-top: 14px; line-height: 1.5;">${cleanFooterText}</p>`;
      }

      // Convert markdown **bold** to <strong>
      let formattedText = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Preserve single line breaks inside sign-off (e.g., "Best,\nRashard")
      formattedText = formattedText.replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #333333;">${formattedText}</p>`;
    })
    .join('');
}
