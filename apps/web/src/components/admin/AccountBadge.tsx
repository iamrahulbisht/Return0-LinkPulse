import type { AccountStatus, Role } from '../../types';

const LOOK: Record<AccountStatus, { label: string; cls: string; dot: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-ok border border-ok-line', dot: 'bg-ok' },
  suspended: { label: 'Suspended', cls: 'bg-danger-bg text-danger border border-danger-line', dot: 'bg-danger' },
  locked: { label: 'Locked', cls: 'bg-warn-bg text-warn border border-warn-line', dot: 'bg-warn' },
  password_reset: { label: 'Password reset', cls: 'bg-limit-bg text-limit border border-limit-line', dot: 'bg-limit' },
};

/** Account status: dot + word, never colour alone (same look as the link StatusBadge). */
export function AccountBadge({ status }: { status: AccountStatus }) {
  const s = LOOK[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${s.cls}`}>
      <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/** Only shown for admins, so a platform admin stands out in the user list. */
export function RoleBadge({ role }: { role: Role }) {
  if (role !== 'admin') return null;
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.10)] px-2.5 py-1 text-[12.5px] font-bold text-[#FCD34D]">
      Admin
    </span>
  );
}
