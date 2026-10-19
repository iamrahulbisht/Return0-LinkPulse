import type { ReviewItem, ReviewTone } from './review';

const TONE: Record<ReviewTone, string> = {
  fix: 'bg-danger-bg text-danger',
  check: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
  note: 'bg-accent-50 text-accent-700',
  muted: 'bg-bot-bg text-text-2',
};

export function ReviewPanel({ items }: { items: ReviewItem[] }) {
  const errs = items.some((i) => i.tone === 'fix');
  return (
    <div aria-live="polite" className={`flex flex-col gap-3 rounded-[16px] border px-5 py-[18px] ${errs ? 'border-danger-line bg-danger-bg' : 'border-line bg-subtle'}`}>
      <span className="text-[13px] font-bold uppercase tracking-[.08em] text-text-3">Review before publishing</span>
      {items.map((w) => (
        <div key={w.text} className="flex items-start gap-2.5 text-[14.5px]">
          <span className={`flex-none rounded-[6px] px-2 py-[3px] text-[12px] font-bold ${TONE[w.tone]}`}>{w.kind}</span>
          <span className="text-fg">{w.text}</span>
        </div>
      ))}
    </div>
  );
}
