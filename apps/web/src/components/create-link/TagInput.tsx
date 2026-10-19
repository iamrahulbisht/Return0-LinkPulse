import { useId, useState } from 'react';
import { Icon } from '../Icon';

export const MAX_TAGS = 10;

/** Same clean-up the API does (lower case, no leading #), plus spaces → dashes so a tag stays one word. */
export function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 30);
}

export function TagInput({ tags, onChange, known, error }: { tags: string[]; onChange: (t: string[]) => void; known: string[]; error?: string }) {
  const [text, setText] = useState('');
  const id = useId();
  const msgId = `${id}-msg`;
  const full = tags.length >= MAX_TAGS;

  const add = (raw: string) => {
    const t = normaliseTag(raw);
    setText('');
    if (!t || tags.includes(t) || full) return;
    onChange([...tags, t]);
  };

  const q = normaliseTag(text);
  const suggestions = full ? [] : known.filter((k) => !tags.includes(k) && (!q || k.startsWith(q))).slice(0, 5);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14.5px] font-semibold">
        Tags
      </label>
      <div
        className={`flex min-h-[54px] flex-wrap items-center gap-x-1.5 rounded-input border-[1.5px] bg-field px-2.5 focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${
          error ? 'border-[#DC2626]' : 'border-line-strong'
        }`}
      >
        {tags.map((t) => (
          <button key={t} type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="group flex h-11 items-center">
            <span className="flex items-center gap-1.5 rounded-[6px] bg-accent-50 px-2.5 py-1 text-[13px] text-accent-700 group-hover:bg-accent-50">
              #{t}
              <Icon name="x" size={12} strokeWidth={2.6} />
            </span>
          </button>
        ))}
        <input
          id={id}
          type="text"
          value={text}
          disabled={full}
          autoComplete="off"
          spellCheck={false}
          placeholder={full ? `Up to ${MAX_TAGS} tags` : 'Add a tag'}
          aria-describedby={msgId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value.replace(/,/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => text && add(text)}
          className="h-11 min-w-[80px] flex-1 bg-transparent text-[14px] text-fg outline-none disabled:cursor-not-allowed"
        />
      </div>
      <span id={msgId} aria-live="polite" className={`text-[13.5px] ${error ? 'font-semibold text-danger' : 'text-text-4'}`}>
        {error ?? (full ? `You have ${MAX_TAGS} tags, the most a link can have.` : `Press Enter to add. ${tags.length} of ${MAX_TAGS} used.`)}
      </span>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-[13.5px] font-semibold text-text-2">Your tags:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="group flex h-11 items-center" aria-label={`Add tag ${s}`}>
              <span className="rounded-[6px] border border-line bg-subtle px-2.5 py-1 text-[13px] text-text-2 group-hover:border-accent-300 group-hover:bg-accent-50">#{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
