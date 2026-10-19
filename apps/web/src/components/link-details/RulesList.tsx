import type { Link } from '../../types';
import { deviceName, fmtDateTime, fmtNum } from '../../lib/format';
import { Button, CardTitle, statusLabel } from '../ui';

/** The checks a visit goes through, in the order the redirect engine runs them. */
export function RulesList({ link, onEdit }: { link: Link; onEdit: () => void }) {
  const rules: { name: string; val: string }[] = [
    { name: 'Status', val: statusLabel(link.status) },
    { name: 'Domain check', val: link.status === 'disabled' ? 'Blocked' : 'Not blocked' },
    { name: 'Expiry', val: link.expiresAt ? `${fmtDateTime(link.expiresAt)} IST` : 'None' },
    { name: 'Password', val: link.hasPassword ? 'On · 5 tries, then wait' : 'Off' },
    { name: 'Bot filter', val: 'On' },
    { name: 'Click limit', val: link.clickLimit != null ? `${fmtNum(link.clickLimit)} human clicks` : 'No limit' },
    { name: 'Device rules', val: link.rules.length ? link.rules.map((r) => deviceName(r.device)).join(', ') : 'None' },
  ];
  return (
    <section aria-labelledby="ld-rules" className="flex min-w-0 flex-[2_1_340px] flex-col gap-3.5 rounded-card border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-2">
        <CardTitle id="ld-rules">Rules, in order</CardTitle>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {rules.map((r, i) => (
          <li key={r.name} className="flex items-center gap-3 border-b border-line-soft py-2.5 text-[14.5px] last:border-b-0">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-accent-50 font-mono text-[12px] font-bold text-accent-700">{i + 1}</span>
            <span className="flex-1 font-semibold">{r.name}</span>
            <span className="text-right text-text-2">{r.val}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
