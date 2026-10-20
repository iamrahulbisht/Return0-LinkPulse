import { useId, type FormEvent, type ReactNode } from 'react';
import { plural } from '../lib/format';
import { Button } from '../components/ui';

export const MAX_PASTE_LINKS = 500; // same limit as the API (MAX_ROWS)
export const MAX_PASTE_CHARS = 150_000; // same limit as the API (MAX_PASTE_CHARS)

/**
 * Same split as the API (logic/paste.ts): spaces, tabs or new lines, trailing , or ; dropped.
 * Only used for the live count; the server splits again and is the one that decides.
 */
export function splitPastedLinks(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.replace(/[,;]+$/, ''))
    .filter(Boolean);
}

/** Quick checks before sending, so people get the message without waiting. The server checks again. */
export function checkPastedText(text: string): string | null {
  if (text.length > MAX_PASTE_CHARS) return `That is too much text. Paste up to ${MAX_PASTE_LINKS} links at a time.`;
  const n = splitPastedLinks(text).length;
  if (n === 0) return 'Paste at least one link.';
  if (n > MAX_PASTE_LINKS) return `That is ${n} links. Paste up to ${MAX_PASTE_LINKS} at a time.`;
  return null;
}

export function PasteLinksBox({
  value,
  onChange,
  onSubmit,
  busy,
  error,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: ReactNode;
}) {
  const id = useId();
  const count = splitPastedLinks(value).length;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <label htmlFor={id} className="font-display text-[19px] font-bold">
        Paste your links
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        spellCheck={false}
        autoComplete="off"
        placeholder={'https://example.com/register\nhttps://example.com/schedule https://example.com/venue'}
        aria-describedby={`${id}-hint`}
        disabled={busy}
        className="min-h-[180px] resize-y rounded-input border-[1.5px] border-line-strong bg-field px-3.5 py-3 font-mono text-[14px] leading-relaxed text-fg outline-none focus:border-accent-400 focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)] disabled:cursor-wait disabled:opacity-70"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={`${id}-hint`} className="text-[13.5px] text-text-4">
          One link per line, or separated by spaces. Each gets a random short code. Up to {MAX_PASTE_LINKS} links.
        </span>
        <Button type="submit" variant="primary" busy={busy} disabled={count === 0}>
          {count === 0 ? 'Check links' : `Check ${plural(count, 'link')}`}
        </Button>
      </div>
      {error}
    </form>
  );
}
