import { Link as RouterLink } from 'react-router-dom';
import { LogoMark } from '../Logo';
import { Icon } from '../Icon';

export type WizardStep = 1 | 2 | 3;

function StepItem({ n, label, short, step }: { n: 1 | 2; label: string; short: string; step: WizardStep }) {
  const current = step === n;
  const done = step > n;
  const dot = current ? 'bg-accent-400 text-black' : done ? 'bg-[#16A34A] text-white' : 'bg-line text-text-3';
  return (
    <li className="flex items-center gap-2.5" aria-current={current ? 'step' : undefined}>
      <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[14px] font-bold ${dot}`}>
        {done ? <Icon name="check" size={15} strokeWidth={3} /> : n}
      </span>
      <span className={`font-semibold ${!current && !done ? 'text-text-3' : ''}`}>
        {/* Short label on phones so both steps fit on one line. */}
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{label}</span>
        {done && <span className="sr-only"> (done)</span>}
      </span>
    </li>
  );
}

/** Wizard header: logo, the two steps, and Cancel. Phones: title + Cancel on one row, the steps on the next. */
export function WizardHeader({ step }: { step: WizardStep }) {
  return (
    <header className="border-b border-line bg-surface px-4 sm:px-8">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 md:flex md:min-h-[76px] md:justify-between md:gap-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <LogoMark size={30} />
          <span className="font-display text-[20px] font-bold">Create a link</span>
        </div>
        <ol aria-label="Progress" className="col-span-2 row-start-2 m-0 flex list-none items-center gap-2.5 p-0 text-[14.5px] sm:gap-3.5">
          <StepItem n={1} label="Destination and alias" short="Destination" step={step} />
          <li aria-hidden className={`h-0.5 w-8 sm:w-12 ${step > 1 ? 'bg-[#16A34A]' : 'bg-line'}`} />
          <StepItem n={2} label="Options and review" short="Options" step={step} />
        </ol>
        <RouterLink
          to="/links"
          className="col-start-2 row-start-1 flex min-h-[44px] items-center gap-2 rounded-[10px] px-3 text-[15px] font-semibold text-text-2 no-underline hover:bg-subtle hover:text-fg"
        >
          <Icon name="x" size={18} strokeWidth={2.2} />
          Cancel
        </RouterLink>
      </div>
    </header>
  );
}
