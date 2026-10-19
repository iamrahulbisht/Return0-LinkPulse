const STEPS = ['Upload', 'Review', 'Import'] as const;

/** Upload → Review → Import. `current` is the 0-based active step; every step before it is done. `allDone` marks the last one done too. */
export function ImportStepper({ current, allDone = false }: { current: number; allDone?: boolean }) {
  return (
    <ol aria-label="Import progress" className="m-0 flex list-none flex-wrap items-center gap-2.5 p-0 text-[14px] font-semibold">
      {STEPS.map((label, i) => {
        const done = i < current || allDone;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2.5">
            {i > 0 && <span aria-hidden className={`h-0.5 w-7 ${i <= current || allDone ? 'bg-[#16A34A]' : 'bg-line'}`} />}
            <span aria-current={active ? 'step' : undefined} className={`flex items-center gap-2 ${done ? 'text-ok' : active ? 'text-fg' : 'text-text-3'}`}>
              <span
                aria-hidden
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] ${
                  done ? 'bg-[#16A34A] text-white' : active ? 'bg-accent-400 text-black' : 'bg-line text-text-3'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              {label}
              {done && <span className="sr-only">(done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
