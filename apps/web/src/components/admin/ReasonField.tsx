import { useId } from 'react';

export const MIN_REASON = 5; // same limits as the API (reasonSchema / reasonField)
export const MAX_REASON = 300;

/** Client-side check before sending; the API checks again. */
export function reasonProblem(reason: string): string | null {
  return reason.trim().length < MIN_REASON ? `Write a reason of at least ${MIN_REASON} characters.` : null;
}

/** The required "why" box for admin actions (account actions, and changes to someone else's link). */
export function ReasonField({
  value,
  onChange,
  error,
  hint,
  label = 'Reason',
  placeholder = 'For example: phishing pages reported by students',
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint: string;
  label?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        maxLength={MAX_REASON}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-msg`}
        placeholder={placeholder}
        className={`min-h-[88px] rounded-input bg-field px-3.5 py-2.5 text-[15px] text-fg outline-none focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${
          error ? 'border-2 border-[#DC2626]' : 'border-[1.5px] border-line-strong'
        }`}
      />
      <span id={`${id}-msg`} className={`text-[13.5px] ${error ? 'font-semibold text-danger' : 'text-text-4'}`}>
        {error ?? `${hint} ${value.length} / ${MAX_REASON}`}
      </span>
    </div>
  );
}
