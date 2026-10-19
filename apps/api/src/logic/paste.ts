/**
 * Splits links pasted into the bulk import box. Links are separated by spaces, tabs or new lines
 * (a URL can never contain raw whitespace, so this never cuts one in half).
 * A trailing comma or semicolon is dropped: it is almost always from pasting "a, b" or a sentence,
 * and a real destination never ends with one.
 */
export function splitPastedLinks(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.replace(/[,;]+$/, ''))
    .filter(Boolean);
}
