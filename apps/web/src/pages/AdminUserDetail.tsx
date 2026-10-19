// Admin → one user: account, their links across every workspace, workspaces, and account history,
// plus suspend / reactivate / unlock / sign out / reset password with a reason (docs/design/admin-management.md, milestones 1–3).
import { useCallback, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDateTime, fmtDay, fmtNum, plural, prettyUrl } from '../lib/format';
import type { AccountAction, AdminUserDetail as Detail, AdminUserLinks, LinkStatus } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../hooks/useToast';
import { Icon } from '../components/Icon';
import { Button, CardTitle, ErrorState, ShortLink, Skeleton, StatusBadge } from '../components/ui';
import { AccountBadge, RoleBadge } from '../components/admin/AccountBadge';
import { AccountActionDialog } from '../components/admin/AccountActionDialog';
import { HistoryList } from '../components/link-details/SidePanels';

const DONE: Record<AccountAction, string> = {
  suspend: 'Account suspended. Their sessions have ended.',
  reactivate: 'Account reactivated. They can sign in again.',
  unlock: 'Account unlocked. They can try again now.',
  'sign-out': 'Signed out on every device.',
  'reset-password': 'Password reset. They must set a new one when they sign in.',
};

type LinkFilter = 'all' | LinkStatus;
const LINK_FILTERS: { id: LinkFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'limit_reached', label: 'Limit reached' },
  { id: 'expired', label: 'Expired' },
  { id: 'disabled', label: 'Disabled' },
];
const PAGE_SIZE = 10;

function BackLink() {
  return (
    <RouterLink to="/admin/users" className="flex min-h-[44px] items-center gap-2 self-start text-[14.5px] font-semibold no-underline">
      <Icon name="arrowLeft" size={16} strokeWidth={2.2} />
      All users
    </RouterLink>
  );
}

export function AdminUserDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const detail = useAsync(() => api.admin.user(id), [id]);
  const { me } = useAuth();
  const toast = useToast();
  // The action whose confirm dialog is open (tied to this user id, like the Link life dialog).
  const [ask, setAsk] = useState<{ id: string; action: AccountAction } | null>(null);
  const action = ask?.id === id ? ask.action : null;
  const closeAsk = useCallback(() => setAsk(null), []);
  const { reload } = detail;
  const finish = useCallback(
    (done: AccountAction) => {
      setAsk(null);
      toast(DONE[done]);
      // Status badge, banner and account history all come from the detail call.
      void reload(true);
    },
    [reload, toast],
  );

  if (detail.error && !detail.data) {
    const e = detail.error;
    return (
      <>
        <BackLink />
        <ErrorState message={e.status === 404 ? 'We can’t find this user.' : e.message} onRetry={e.status === 404 ? undefined : () => void detail.reload()} />
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        <BackLink />
        <Skeleton className="h-[150px] w-full rounded-[20px]" />
        <Skeleton className="h-[360px] w-full rounded-card" />
      </>
    );
  }

  const { user, workspaces, links, history } = detail.data;
  return (
    <>
      <BackLink />
      <AccountHeader
        user={user}
        canAct={user.role === 'user' && user.id !== me?.user.id}
        onAction={(a) => setAsk({ id: user.id, action: a })}
      />
      {action && (
        <AccountActionDialog
          key={action}
          userId={user.id}
          name={user.name}
          action={action}
          activeLinks={links.active}
          onClose={closeAsk}
          onDone={finish}
        />
      )}
      <div className="flex flex-wrap items-start gap-4">
        <UserLinks userId={user.id} counts={links} />
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
          <WorkspacesCard workspaces={workspaces} />
          <HistoryList
            title="Account history"
            empty="No admin actions on this account yet."
            items={history}
            loading={detail.loading}
            error={detail.error}
            onRetry={() => void detail.reload()}
          />
        </div>
      </div>
    </>
  );
}

function AccountHeader({ user, canAct, onAction }: { user: Detail['user']; canAct: boolean; onAction: (a: AccountAction) => void }) {
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <section aria-labelledby="au-name" className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-[#202026] font-display text-[20px] font-bold text-accent-400">
          {initials || '?'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 id="au-name" className="m-0 min-w-0 break-words font-display text-[26px] font-bold tracking-tight sm:text-[30px]">
              {user.name}
            </h1>
            <AccountBadge status={user.status} />
            <RoleBadge role={user.role} />
          </div>
          <span className="break-all text-[15px] text-text-2">{user.email}</span>
          <span className="text-[13.5px] text-text-4">
            Joined {fmtDay(user.createdAt)} · {user.lastLoginAt ? `Last sign-in ${fmtDateTime(user.lastLoginAt)} IST` : 'Never signed in'}
          </span>
        </div>
      </div>
      {canAct ? (
        <div role="group" aria-label="Account actions" className="flex flex-wrap gap-2.5">
          {user.status === 'suspended' ? (
            <Button size="sm" variant="primary" onClick={() => onAction('reactivate')}>
              Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="danger" icon="ban" onClick={() => onAction('suspend')}>
              Suspend
            </Button>
          )}
          {user.status === 'locked' && (
            <Button size="sm" icon="lock" onClick={() => onAction('unlock')}>
              Unlock
            </Button>
          )}
          {/* A suspended account has no sessions left to end, and cannot sign in with a new password anyway. */}
          {user.status !== 'suspended' && (
            <>
              <Button size="sm" icon="shield" onClick={() => onAction('reset-password')}>
                Reset password
              </Button>
              <Button size="sm" icon="logout" onClick={() => onAction('sign-out')}>
                Sign out everywhere
              </Button>
            </>
          )}
        </div>
      ) : (
        <span className="text-[13.5px] text-text-4">
          {user.role === 'admin' ? 'Admin accounts can’t be changed here.' : 'This is your account. Manage it from your Profile.'}
        </span>
      )}
      {user.status === 'suspended' && (
        <p className="m-0 flex items-start gap-2.5 rounded-[14px] border border-danger-line bg-danger-bg p-4 text-[14.5px] text-[#FCA5A5]">
          <Icon name="ban" className="mt-px flex-none text-danger" />
          <span>
            Suspended{user.suspendedReason ? `: ${user.suspendedReason}` : ''}. They cannot sign in. Their links still work unless disabled.
          </span>
        </p>
      )}
      {user.status === 'locked' && user.lockedUntil && (
        <p className="m-0 flex items-start gap-2.5 rounded-[14px] border border-warn-line bg-warn-bg p-4 text-[14.5px] text-warn">
          <Icon name="lock" className="mt-px flex-none" />
          <span>Locked after 5 wrong passwords, until {fmtDateTime(user.lockedUntil)} IST.</span>
        </p>
      )}
    </section>
  );
}

function UserLinks({ userId, counts }: { userId: string; counts: Detail['links'] }) {
  const [status, setStatus] = useState<LinkFilter>('all');
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const q = useDebounce(text.trim(), 300);
  const list = useAsync(() => api.admin.userLinks(userId, { q: q || undefined, status, page, pageSize: PAGE_SIZE }), [userId, q, status, page]);

  return (
    <section aria-labelledby="au-links" className="flex min-w-0 flex-[3_1_560px] flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle id="au-links">Links they created</CardTitle>
        <span className="text-[13.5px] text-text-4">Open a link to edit it, change its state or see its history.</span>
      </div>
      <div role="group" aria-label="Filter links by status" className="flex flex-wrap gap-1.5">
        {LINK_FILTERS.map((f) => {
          const on = f.id === status;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setStatus(f.id);
                setPage(1);
              }}
              className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-chip border px-3 text-[13.5px] font-semibold ${
                on ? 'border-accent-400 bg-accent-50 text-fg' : 'border-line bg-transparent text-text-3 hover:text-fg'
              }`}
            >
              {f.label}
              <span className="font-mono text-[12px] text-text-4">{fmtNum(counts[f.id])}</span>
            </button>
          );
        })}
      </div>
      <label className="flex h-11 items-center gap-2.5 rounded-input border-[1.5px] border-line-strong bg-field px-3.5 focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)]">
        <Icon name="search" size={18} className="flex-none text-text-4" />
        <span className="sr-only">Search this user’s links</span>
        <input
          type="search"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
          placeholder="Search by alias, destination or title"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none"
        />
      </label>
      {list.error && !list.data ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : (
        <LinksTable list={list.data} loading={list.loading} />
      )}
      {list.data && list.data.total > list.data.pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] text-text-3">
          <span aria-live="polite">
            Page {list.data.page} of {Math.ceil(list.data.total / list.data.pageSize)} · {plural(list.data.total, 'link')}
          </span>
          <nav aria-label="Pages" className="flex gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </nav>
        </div>
      )}
    </section>
  );
}

function LinksTable({ list, loading }: { list?: AdminUserLinks; loading: boolean }) {
  if (list && list.items.length === 0) {
    return <p className="m-0 py-6 text-center text-[14.5px] text-text-3">No links here.</p>;
  }
  return (
    <div className="relative -mx-1 overflow-x-auto px-1" role="region" aria-label="Links table" tabIndex={0}>
      <table className={`w-full min-w-[640px] border-collapse text-[14px] transition-opacity ${loading && list ? 'opacity-60' : ''}`}>
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-[.06em] text-text-4">
            <th scope="col" className="py-2.5 pr-2 font-semibold">Short link</th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Workspace</th>
            <th scope="col" className="px-2 py-2.5 text-right font-semibold">Clicks</th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Status</th>
            <th scope="col" className="py-2.5 pl-2 font-semibold">Created</th>
          </tr>
        </thead>
        <tbody>
          {list
            ? list.items.map((l) => (
                <tr key={l.id} className="border-t border-line-soft">
                  <td className="max-w-[280px] py-3 pr-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <RouterLink to={`/links/${l.id}`} className="font-semibold text-fg no-underline hover:underline">
                        <ShortLink code={l.code} />
                      </RouterLink>
                      <span className="truncate font-mono text-[12.5px] text-text-4" title={l.destination}>
                        {prettyUrl(l.destination)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-text-2">{l.workspace.name}</td>
                  <td className="px-2 py-3 text-right font-mono">{fmtNum(l.clickCount)}</td>
                  <td className="px-2 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="whitespace-nowrap py-3 pl-2 text-text-3">{fmtDay(l.createdAt)}</td>
                </tr>
              ))
            : Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-t border-line-soft">
                  <td colSpan={5} className="py-3">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkspacesCard({ workspaces }: { workspaces: Detail['workspaces'] }) {
  return (
    <section aria-labelledby="au-ws" className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-6">
      <CardTitle id="au-ws">Workspaces</CardTitle>
      {workspaces.length === 0 ? (
        <span className="text-[14px] text-text-4">Not in any workspace.</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 text-[14.5px] last:border-b-0">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{w.name}</span>
                <span className="text-[13px] text-text-4">
                  {plural(w.members, 'member')} · {plural(w.links, 'link')}
                </span>
              </div>
              <span className={`rounded-chip px-2.5 py-1 text-[12.5px] font-semibold ${w.isOwner ? 'bg-accent-50 text-accent-700' : 'bg-line-soft text-text-3'}`}>
                {w.isOwner ? 'Owner' : 'Member'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
