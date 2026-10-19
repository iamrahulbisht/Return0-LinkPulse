// Turns audit rows into plain sentences for the "History" and "Audit log" panels.

type J = Record<string, unknown> | null;

const fmtDate = (v: unknown) =>
  v
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(String(v)))
    : 'none';
const fmtNum = (v: unknown) => (v == null ? 'no limit' : Number(v).toLocaleString('en-IN'));

export function describeAudit(action: string, oldV: J, newV: J): string {
  switch (action) {
    case 'link_created':
      return newV?.via === 'import' ? 'Link created by CSV import' : 'Link created with the wizard';
    case 'limit_changed': {
      const o = oldV?.clickLimit, n = newV?.clickLimit;
      if (o == null) return `Click limit set to ${fmtNum(n)}`;
      if (n == null) return `Click limit removed (was ${fmtNum(o)})`;
      return `Limit ${Number(n) > Number(o) ? 'raised' : 'lowered'} from ${fmtNum(o)} to ${fmtNum(n)}`;
    }
    case 'expiry_changed': {
      const o = oldV?.expiresAt, n = newV?.expiresAt;
      if (!o) return `Expiry set to ${fmtDate(n)}`;
      if (!n) return 'Expiry removed';
      return `Expiry ${new Date(String(n)) > new Date(String(o)) ? 'extended' : 'moved'} from ${fmtDate(o)} to ${fmtDate(n)}`;
    }
    case 'password_added':
      return 'Password added';
    case 'password_changed':
      return 'Password changed';
    case 'password_removed':
      return 'Password removed';
    case 'destination_changed':
      return 'Destination changed';
    case 'fallback_changed':
      return newV?.fallbackUrl ? 'Fallback URL set' : 'Fallback URL removed';
    case 'rules_changed':
      return `Device rules updated (${Array.isArray(newV?.rules) ? (newV!.rules as unknown[]).length : 0} rules)`;
    case 'campaign_changed':
      return newV?.campaign ? `Moved to campaign ${String(newV.campaign)}` : 'Removed from campaign';
    case 'tags_changed':
      return 'Tags updated';
    case 'title_changed':
      return 'Title changed';
    case 'disabled':
      return 'Disabled';
    case 'restored':
      return 'Restored';
    case 'cache_cleared':
      return 'Cleared cache for';
    case 'flag_dismissed':
      return 'Marked as fine';
    case 'domain_blocked':
      return 'Blocked domain';
    case 'domain_unblocked':
      return 'Unblocked domain';
    case 'account_suspended':
      return 'Account suspended';
    case 'account_reactivated':
      return 'Account reactivated';
    case 'account_unlocked':
      return 'Account unlocked';
    case 'account_signed_out':
      return 'Signed out on every device';
    case 'account_password_reset':
      return 'Password reset by an admin';
    case 'account_email_changed':
      return 'Email changed for';
    case 'account_password_changed':
      return 'Password changed for';
    case 'account_sessions_revoked':
      return 'Other devices signed out for';
    default:
      return action.replace(/_/g, ' ');
  }
}

/** An audit row about a user (subject_user_id), as shown on the admin user page and in the owner's Account notices. */
export interface SubjectAuditRow {
  id: bigint;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: Date;
  linkId: string | null;
  target: string;
  actor: { name: string; role: string } | null;
}

export function subjectHistoryItem(a: SubjectAuditRow, shortHost: string) {
  return {
    id: a.id.toString(),
    action: a.action,
    text: describeAudit(a.action, a.oldValue as J, a.newValue as J),
    actor: a.actor ? (a.actor.role === 'admin' ? 'Platform admin' : a.actor.name) : 'System',
    reason: a.reason,
    // Admin changes to one of their links: which link (link rows keep the short code in `target`).
    link: a.linkId ? `${shortHost}/${a.target}` : null,
    at: a.createdAt.toISOString(),
  };
}
