const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractEmailsFromText(text: string): { valid: string[]; invalidCount: number } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: string[] = [];
  let invalidCount = 0;

  for (const token of tokens) {
    if (EMAIL_REGEX.test(token)) {
      valid.push(token.toLowerCase());
    } else {
      invalidCount++;
    }
  }

  return { valid: Array.from(new Set(valid)), invalidCount };
}
