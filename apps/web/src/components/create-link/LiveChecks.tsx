import type { CheckState, ValidateResult } from '../../types';
import { Icon } from '../Icon';

export type Check = ValidateResult['checks'][number];

/** Shown before the first answer from /links/validate arrives (same labels the API uses). */
export const PLACEHOLDER_CHECKS: Check[] = [
  { id: 'url', label: 'Valid web address', state: 'wait', note: 'Waiting for a URL' },
  { id: 'block', label: 'Domain is not blocked', state: 'wait', note: 'Checked after the URL is valid' },
  { id: 'loop', label: 'No redirect loop', state: 'wait', note: 'Checked after the URL is valid' },
  { id: 'alias', label: 'Alias is free and allowed', state: 'ok', note: 'We will make a random 7-character code' },
];

const LOOK: Record<CheckState, { dot: string; note: string; sr: string }> = {
  ok: { dot: 'bg-[#16A34A]', note: 'text-ok', sr: '(passed)' },
  bad: { dot: 'bg-[#DC2626]', note: 'text-danger', sr: '(problem)' },
  wait: { dot: 'border-2 border-dashed border-[#52525B] bg-surface', note: 'text-text-4', sr: '(waiting)' },
};

export function LiveChecks({ checks, stale }: { checks: Check[]; stale: boolean }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[16px] border border-line bg-subtle px-5 py-[18px]">
      <span className="text-[13px] font-bold uppercase tracking-[.08em] text-text-3">
        Live checks
        {stale && <span className="ml-2 font-semibold normal-case tracking-normal text-text-4">Checking…</span>}
      </span>
      <ul aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0">
        {checks.map((c) => {
          const look = LOOK[c.state];
          return (
            <li key={c.id} className="flex items-start gap-3">
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${look.dot}`}>
                {c.state === 'ok' && <Icon name="check" size={14} strokeWidth={3.2} className="text-white" />}
                {c.state === 'bad' && <Icon name="x" size={12} strokeWidth={3.4} className="text-white" />}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold text-fg">
                  {c.label} <span className="sr-only">{look.sr}</span>
                </span>
                <span className={`break-words text-[13.5px] ${look.note}`}>{c.note}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
