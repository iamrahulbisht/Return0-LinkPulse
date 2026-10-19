import type { Flag } from '../../types';
import { Button, ShortLink } from '../ui';
import { Icon, type IconName } from '../Icon';
import { prettyUrl } from '../../lib/format';

/** What the card shows. `ok` lives only in the page until the next reload (the server already dropped the flag). */
export type FlagView = 'open' | 'ok' | 'disabled';

// Red for the two that usually mean real harm, amber for the softer signals (as in admin.html).
const TAG_TONE: Record<Flag['type'], string> = {
  spike: 'bg-danger-bg text-danger',
  report: 'bg-danger-bg text-danger',
  blocked: 'bg-warn-bg text-warn',
  bots: 'bg-warn-bg text-warn',
};

const VIEW: Record<FlagView, { box: string; iconBox: string; icon: IconName }> = {
  open: { box: 'border-line bg-surface', iconBox: 'bg-danger-bg text-danger', icon: 'warn' },
  ok: { box: 'border-ok-line bg-ok-bg', iconBox: 'bg-ok-bg text-ok', icon: 'check' },
  disabled: { box: 'border-danger-line bg-danger-bg', iconBox: 'bg-danger-bg text-danger', icon: 'ban' },
};

interface Props {
  flag: Flag;
  view: FlagView;
  busy: 'dismiss' | null;
  onDismiss: () => void;
  onAskDisable: () => void;
  onAskRestore: () => void;
}

export function FlagCard({ flag, view, busy, onDismiss, onAskDisable, onAskRestore }: Props) {
  const v = VIEW[view];
  const tag = view === 'disabled' ? 'Disabled' : view === 'ok' ? 'Reviewed' : flag.label;
  const tagTone = view === 'ok' ? 'bg-ok-bg text-ok' : view === 'disabled' ? 'bg-danger-bg text-danger' : TAG_TONE[flag.type];
  return (
    <article className={`flex flex-wrap items-center gap-4 rounded-[16px] border-[1.5px] p-[18px] ${v.box}`} aria-label={`${flag.label}: ${flag.link.code}`}>
      <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-input ${v.iconBox}`}>
        <Icon name={v.icon} size={22} />
      </span>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <ShortLink code={flag.link.code} className="text-[16px]" />
          <span className={`rounded-full px-2.5 py-[3px] text-[12.5px] font-bold ${tagTone}`}>{tag}</span>
        </div>
        <span className="text-[14.5px] text-fg">{flag.reason}</span>
        <span className="break-words text-[13px] text-text-4">
          Owner: {flag.link.owner} · goes to <span className="break-all font-mono">{prettyUrl(flag.link.destination)}</span>
        </span>
        {view === 'disabled' && flag.link.disabledReason && <span className="text-[13px] text-text-3">Reason: {flag.link.disabledReason}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {view === 'open' && (
          <>
            <Button size="sm" onClick={onDismiss} busy={busy === 'dismiss'} aria-label={`Looks fine: ${flag.link.code}`}>
              Looks fine
            </Button>
            <Button size="sm" variant="danger" icon="ban" onClick={onAskDisable} disabled={busy !== null} aria-label={`Disable link ${flag.link.code}`}>
              Disable link
            </Button>
          </>
        )}
        {view === 'disabled' && (
          <>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-danger">
              <Icon name="ban" size={16} />
              Redirects stopped
            </span>
            <Button size="sm" onClick={onAskRestore} disabled={busy !== null} aria-label={`Restore ${flag.link.code}`}>
              Restore
            </Button>
          </>
        )}
        {view === 'ok' && (
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ok">
            <Icon name="check" size={16} />
            Marked as fine
          </span>
        )}
      </div>
    </article>
  );
}
