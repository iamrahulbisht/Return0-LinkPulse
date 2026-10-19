import { forwardRef } from 'react';
import { SHORT_HOST } from '../../lib/api';
import { Button } from '../ui';
import { Icon } from '../Icon';
import { LiveChecks, type Check } from './LiveChecks';

export type Tone = 'ok' | 'bad' | 'neutral';

const BORDER: Record<Tone, string> = { ok: 'border-[#16A34A]', bad: 'border-[#DC2626]', neutral: 'border-line-strong' };
const HELP: Record<Tone, string> = { ok: 'text-ok', bad: 'text-danger font-semibold', neutral: 'text-text-4' };

export interface DestinationStepProps {
  destination: string;
  onDestination: (v: string) => void;
  urlTone: Tone;
  urlHelp: string;
  alias: string;
  onAlias: (v: string) => void;
  onRandom: () => void;
  aliasTone: Tone;
  aliasHelp: string;
  suggestions: string[];
  checks: Check[];
  stale: boolean;
  gate: { text: string; tone: Tone };
  onRetryCheck: (() => void) | null;
  canContinue: boolean;
  onContinue: () => void;
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export const DestinationStep = forwardRef<HTMLHeadingElement, DestinationStepProps>(function DestinationStep(p, ref) {
  return (
    <section className="flex flex-col gap-[26px] rounded-[20px] border border-line bg-surface p-5 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h1 ref={ref} tabIndex={-1} className="m-0 font-display text-[30px] font-bold tracking-[-0.02em] outline-none">
          Where should the link go?
        </h1>
        <p className="m-0 text-[15.5px] text-text-3">We check everything as you type, so problems show up before you publish.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="cl-dest" className="text-[14.5px] font-semibold">
          Destination URL
        </label>
        <input
          id="cl-dest"
          type="url"
          inputMode="url"
          // Not "url": that made the browser list every address typed before.
          autoComplete="off"
          spellCheck={false}
          placeholder="https://"
          value={p.destination}
          onChange={(e) => p.onDestination(e.target.value)}
          aria-describedby="cl-dest-help"
          aria-invalid={p.urlTone === 'bad' ? true : undefined}
          className={`h-14 rounded-input border-2 bg-field px-4 font-mono text-[15px] text-fg outline-none focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${BORDER[p.urlTone]}`}
        />
        <span id="cl-dest-help" aria-live="polite" className={`text-[13.5px] ${HELP[p.urlTone]}`}>
          {p.urlHelp}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="cl-alias" className="text-[14.5px] font-semibold">
          Short link <span className="font-normal text-text-4">(leave empty for a random code)</span>
        </label>
        <div className="flex flex-wrap gap-2.5">
          <div
            className={`flex min-w-0 flex-[1_1_260px] items-center overflow-hidden rounded-input border-2 bg-field focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${BORDER[p.aliasTone]}`}
          >
            <span className="max-w-[55%] truncate pl-4 pr-0.5 font-mono text-[15px] text-text-4">{SHORT_HOST}/</span>
            <input
              id="cl-alias"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              value={p.alias}
              onChange={(e) => p.onAlias(e.target.value)}
              aria-describedby="cl-alias-help"
              aria-invalid={p.aliasTone === 'bad' ? true : undefined}
              className="h-[52px] min-w-0 flex-1 bg-transparent pr-3 font-mono text-[15px] font-semibold text-fg outline-none"
            />
          </div>
          <Button onClick={p.onRandom} size="lg">
            <RefreshIcon />
            Random code
          </Button>
        </div>
        <span id="cl-alias-help" aria-live="polite" className={`text-[13.5px] ${HELP[p.aliasTone]}`}>
          {p.aliasHelp}
        </span>
        {p.suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-[13.5px] font-semibold text-text-2">Free instead:</span>
            {p.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => p.onAlias(s)} className="group flex h-11 items-center" aria-label={`Use ${SHORT_HOST}/${s}`}>
                <span className="flex min-h-[36px] items-center rounded-full bg-accent-50 px-3.5 font-mono text-[13.5px] font-semibold text-accent-700 group-hover:bg-accent-50">{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <LiveChecks checks={p.checks} stale={p.stale} />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-[22px]">
        <span className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className={`text-[14px] font-semibold ${p.gate.tone === 'bad' ? 'text-danger' : p.gate.tone === 'ok' ? 'text-ok' : 'text-text-4'}`}>{p.gate.text}</span>
          {p.onRetryCheck && (
            <Button size="sm" variant="ghost" onClick={p.onRetryCheck}>
              Check again
            </Button>
          )}
        </span>
        <Button variant="primary" size="lg" disabled={!p.canContinue} onClick={p.onContinue}>
          Continue to options
          <Icon name="chevronRight" size={18} strokeWidth={2.4} />
        </Button>
      </div>
    </section>
  );
});
