import { Link as RouterLink } from 'react-router-dom';
import type { AlertItem } from '../../types';
import { fmtDateTime } from '../../lib/format';
import { Icon, type IconName } from '../Icon';
import { ShortLink, shortHost } from '../ui';

type Tone = 'amber' | 'red' | 'grey';

const TONE: Record<Tone, { box: string; icon: string; sub: string }> = {
  amber: { box: 'bg-warn-bg border-warn-line', icon: 'text-warn', sub: 'text-[#FDE68A]' },
  red: { box: 'bg-danger-bg border-danger-line', icon: 'text-danger', sub: 'text-[#FCA5A5]' },
  grey: { box: 'bg-bot-bg border-line-strong', icon: 'text-bot', sub: 'text-text-2' },
};

interface AlertView {
  tone: Tone;
  icon: IconName;
  title: string;
  sub: string;
  action: string;
  to: string;
}

function view(a: AlertItem, isAdmin: boolean): AlertView {
  const details = `/links/${a.link.id}`;
  switch (a.type) {
    case 'near_limit':
      return { tone: 'amber', icon: 'warn', title: 'Near limit', sub: a.message, action: 'Raise limit', to: details };
    case 'expiring':
      // The server message is "Expires in N days"; the exact end time goes underneath, in IST.
      return {
        tone: 'amber',
        icon: 'clock',
        title: a.message,
        sub: a.link.expiresAt ? `${fmtDateTime(a.link.expiresAt)} IST` : '',
        action: 'Extend',
        to: details,
      };
    case 'spike':
      return { tone: 'red', icon: 'trend', title: 'Traffic spike', sub: a.message, action: 'Review', to: isAdmin ? '/admin' : details };
    case 'blocked':
      return { tone: 'red', icon: 'ban', title: 'Blocked domain', sub: a.message, action: 'Review', to: details };
    case 'bots':
      return { tone: 'grey', icon: 'bot', title: 'Bot surge', sub: a.message, action: 'View', to: details };
  }
}

export function AlertRow({ alert, isAdmin }: { alert: AlertItem; isAdmin: boolean }) {
  const v = view(alert, isAdmin);
  const t = TONE[v.tone];
  return (
    <li className={`flex gap-3 rounded-[14px] border p-3.5 ${t.box}`}>
      <Icon name={v.icon} size={20} className={`mt-0.5 flex-none ${t.icon}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">
          {v.title} · <ShortLink code={alert.link.code} className="text-[13.5px]" />
        </span>
        {v.sub && <span className={`text-[13.5px] ${t.sub}`}>{v.sub}</span>}
      </div>
      <RouterLink
        to={v.to}
        aria-label={`${v.action}: ${shortHost()}/${alert.link.code}`}
        className="inline-flex min-h-[44px] items-center self-center whitespace-nowrap px-1 text-[13.5px] font-bold"
      >
        {v.action}
      </RouterLink>
    </li>
  );
}
