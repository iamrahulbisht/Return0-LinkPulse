/**
 * One CSV cell. Quotes when needed, and prefixes cells that start with = + - @ so a spreadsheet
 * does not run them as formulas (the report echoes text people typed into their own file).
 */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Saves text as a file without a server round trip. */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const TEMPLATE_CSV = toCsv([
  ['alias', 'destination', 'tags'],
  ['register', 'https://example.com/register', 'event'],
  ['', 'https://example.com/schedule', 'event, schedule'],
]);
