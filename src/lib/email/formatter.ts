/**
 * Email Formatter Utility
 * Guarantees clean greetings, replaces unparsed placeholders, and formats paragraphs consistently.
 */

export function sanitizeGreetingAndBody(
  pitchText: string,
  founderName?: string | null,
  companyName?: string | null
): string {
  if (!pitchText) return pitchText;

  let firstName: string | null = null;
  if (founderName && founderName.trim()) {
    const raw = founderName.trim().split(' ')[0];
    if (
      raw &&
      !['unknown', 'admin', 'contact', 'info', 'sales', 'support', 'team', 'n/a', 'none', 'null'].includes(raw.toLowerCase())
    ) {
      firstName = raw;
    }
  }

  const targetGreeting = firstName ? `Hi ${firstName},` : `Hi,`;

  let cleaned = pitchText.trim();

  // 1. Check top greeting line
  const greetingRegex = /^Hi\s+([^,\n\r]+),?/i;
  const match = cleaned.match(greetingRegex);

  if (match) {
    const matchedName = match[1].trim();
    // Detect placeholders or corporate company names erroneously used as person names
    const isPlaceholder =
      /^\[.*\]$/.test(matchedName) ||
      /first\s*name/i.test(matchedName) ||
      /company/i.test(matchedName);

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

  // 2. Clean up any remaining bracket placeholders and enforce correct company & sender names
  cleaned = cleaned
    .replace(/\[First Name\]/gi, firstName || 'there')
    .replace(/\[Name\]/gi, firstName || 'there')
    .replace(/\[Company Name\]/gi, companyName || 'your company')
    .replace(/\[Company\]/gi, companyName || 'your company')
    .replace(/\bMohamed\b/g, 'Rashard')
    .replace(/\bMR²\b/g, 'Mr²');

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
    .filter((p) => p.length > 0)
    .map((p) => {
      // Preserve single line breaks inside sign-off (e.g., "Best,\nMohamed")
      const formattedLineBreaks = p.replace(/\n/g, '<br />');
      return `<p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #333333;">${formattedLineBreaks}</p>`;
    })
    .join('');
}
