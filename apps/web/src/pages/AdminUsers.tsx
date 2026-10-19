// Admin → Users: search every account by name or email, filter by status, open one (docs/design/admin-management.md).
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtDay, fmtNum, plural } from '../lib/format';
import type { AccountFilter, AdminUserList } from '../types';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { Icon } from '../components/Icon';
import { Button, ErrorState, PageHeader, Skeleton } from '../components/ui';
import { AccountBadge, RoleBadge } from '../components/admin/AccountBadge';

const FILTERS: { id: AccountFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'locked', label: 'Locked' },
];
const PAGE_SIZE = 20;
// The search text holds emails, so it stays out of the URL (and browser history). This tab remembers it for "Back".
const Q_KEY = 'admin-users-q';

const isFilter = (v: string | null): v is AccountFilter => FILTERS.some((f) => f.id === v);

function readQ(): string {
  try {
    return sessionStorage.getItem(Q_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveQ(q: string) {
  try {
    if (q) sessionStorage.setItem(Q_KEY, q);
    else sessionStorage.removeItem(Q_KEY);
  } catch {
    // Storage blocked: search still works, it is just not remembered.
  }
}

export function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const status: AccountFilter = isFilter(params.get('status')) ? (params.get('status') as AccountFilter) : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const setUrl = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const [text, setText] = useState(readQ);
  const q = useDebounce(text.trim(), 300);
  const [searched, setSearched] = useState(q);
  useEffect(() => {
    saveQ(q);
    // A new search starts again at page 1.
    if (q !== searched) {
      setSearched(q);
      if (page !== 1) setUrl({ page: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useAsync(() => api.admin.users({ q: q || undefined, status, page, pageSize: PAGE_SIZE }), [q, status, page]);

  return (
    <>
      <PageHeader title="Users" subtitle="Find an account, then open it to see its links, workspaces and history." />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 max-w-[440px] flex-[1_1_320px] items-center gap-2.5 rounded-input border-[1.5px] border-line-strong bg-field px-3.5 focus-within:shadow-[0_0_0_4px_rgba(212,255,0,.16)]">
          <Icon name="search" size={18} className="flex-none text-text-4" />
          <span className="sr-only">Search users</span>
          <input
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by name or email"
            className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-fg outline-none"
          />
        </label>
        <div role="group" aria-label="Filter by account status" className="flex flex-wrap gap-[3px] rounded-[12px] bg-line-soft p-[3px]">
          {FILTERS.map((f) => {
            const on = f.id === status;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setUrl({ status: f.id === 'all' ? null : f.id, page: null })}
                className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-chip border-0 px-3.5 text-[14px] font-semibold ${
                  on ? 'bg-accent-400 font-bold text-black' : 'bg-transparent text-text-3 hover:text-fg'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 font-mono text-[12px] ${on ? 'bg-black/10' : 'bg-line'}`}>
                  {list.data ? fmtNum(list.data.counts[f.id]) : '–'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section aria-label="Users" aria-busy={list.loading || undefined} className="overflow-hidden rounded-card border border-line bg-surface">
        {list.error && !list.data ? (
          <div className="p-4">
            <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
          </div>
        ) : (
          <UsersTable list={list.data} loading={list.loading} />
        )}
        {list.data && list.data.total > 0 && <Pager list={list.data} onPage={(p) => setUrl({ page: p > 1 ? String(p) : null })} />}
      </section>
    </>
  );
}

const TH = 'px-2 py-3.5 font-semibold';

function UsersTable({ list, loading }: { list?: AdminUserList; loading: boolean }) {
  if (list && list.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-text-3">
        <span className="font-display text-[20px] font-bold text-fg">No users found</span>
        <span className="text-[14.5px]">Check the spelling, or try another status.</span>
      </div>
    );
  }
  return (
    <div className="relative overflow-x-auto" role="region" aria-label="Users table" tabIndex={0}>
      <table className={`w-full min-w-[820px] border-collapse text-[14.5px] transition-opacity ${loading && list ? 'opacity-60' : ''}`}>
        <thead>
          <tr className="bg-subtle text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
            <th scope="col" className="py-3.5 pl-4 pr-2 font-semibold">User</th>
            <th scope="col" className={TH}>Status</th>
            <th scope="col" className={`${TH} text-right`}>Links</th>
            <th scope="col" className={`${TH} text-right`}>Workspaces</th>
            <th scope="col" className={TH}>Joined</th>
            <th scope="col" className="py-3.5 pl-2 pr-4 font-semibold">Last sign-in</th>
          </tr>
        </thead>
        <tbody>
          {list
            ? list.items.map((u) => (
                <tr key={u.id} className="border-t border-line-soft hover:bg-subtle">
                  <td className="py-3 pl-4 pr-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <RouterLink to={`/admin/users/${u.id}`} className="font-semibold text-fg no-underline hover:underline">
                          {u.name}
                        </RouterLink>
                        <RoleBadge role={u.role} />
                      </span>
                      <span className="break-all text-[13.5px] text-text-3">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <AccountBadge status={u.status} />
                  </td>
                  <td className="px-2 py-3 text-right font-mono">{fmtNum(u.links)}</td>
                  <td className="px-2 py-3 text-right font-mono">{fmtNum(u.workspaces)}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-text-3">{fmtDay(u.createdAt)}</td>
                  <td className="whitespace-nowrap py-3 pl-2 pr-4 text-text-3">{u.lastLoginAt ? fmtDay(u.lastLoginAt) : 'Never'}</td>
                </tr>
              ))
            : Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-t border-line-soft">
                  <td colSpan={6} className="px-4 py-4">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ list, onPage }: { list: AdminUserList; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-3.5 text-[14px] text-text-3">
      <span aria-live="polite">
        Showing {fmtNum(list.items.length)} of {plural(list.total, 'user')}
        {pages > 1 && ` · Page ${list.page} of ${pages}`}
      </span>
      <nav aria-label="Pages" className="flex gap-2">
        <Button size="sm" disabled={list.page <= 1} onClick={() => onPage(list.page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={list.page >= pages} onClick={() => onPage(list.page + 1)}>
          Next
        </Button>
      </nav>
    </div>
  );
}
