import { useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { initials } from '../lib/format';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import type { Workspace } from '../types';
import { Icon } from './Icon';
import { Spinner } from './ui';

/**
 * Sidebar button showing the active workspace; opens a list to switch. The list is loaded when it opens,
 * so a workspace you were just added to shows up without a reload. Escape or a click outside closes it.
 */
export function WorkspaceSwitcher() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const listId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api.workspaces
      .list()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load your workspaces.'));
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = async (w: Workspace) => {
    if (w.isActive) return setOpen(false);
    setBusy(w.id);
    try {
      await api.workspaces.switchTo(w.id);
      // The layout re-mounts the page when the active workspace changes, so every list reloads.
      await refresh();
      setOpen(false);
      toast(`Now working in ${w.name}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not switch workspace.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!me) return null;
  const role = me.workspace.role === 'owner' ? 'Owner' : 'Member';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Workspace: ${me.workspace.name} (${role}). Switch workspace`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-[#202026] bg-surface px-3 py-2 text-left transition-colors hover:border-[#2A2A34] hover:bg-[#18181C]"
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#202026] text-[12px] font-bold text-accent-400">{initials(me.workspace.name)}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-semibold text-white">{me.workspace.name}</span>
          <span className="text-[12.5px] text-ondark-3">{role}</span>
        </span>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`flex-none text-ondark-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={listId} className="absolute inset-x-0 top-full z-30 mt-2 flex flex-col gap-1 rounded-xl border border-line-strong bg-ink-3 p-2 shadow-[0_18px_40px_rgba(0,0,0,.7)]">
          <span className="px-2 pb-1 pt-1 text-[11.5px] font-bold uppercase tracking-wider text-ondark-4">Switch workspace</span>
          {error && <span role="alert" className="px-2 py-2 text-[13px] text-danger">{error}</span>}
          {!items && !error && (
            <span className="flex items-center gap-2 px-2 py-2 text-[13px] text-ondark-3">
              <Spinner /> Loading…
            </span>
          )}
          {items?.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => pick(w)}
              disabled={!!busy}
              aria-current={w.isActive || undefined}
              className="flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-left text-ondark-3 transition-colors hover:bg-white/[.06] hover:text-white disabled:cursor-wait"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[#202026] text-[11px] font-bold text-accent-400">{initials(w.name)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-semibold text-white">{w.name}</span>
                <span className="text-[12px]">{w.role === 'owner' ? 'Owner' : `Member · ${w.ownerName}`}</span>
              </span>
              {busy === w.id ? <Spinner /> : w.isActive && <Icon name="check" size={16} className="text-accent-400" />}
            </button>
          ))}
          <NavLink
            to="/workspaces"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-[44px] items-center gap-2 rounded-lg border-t border-line px-2 pt-1 text-[13.5px] font-semibold text-accent-400 no-underline hover:bg-white/[.06]"
          >
            <Icon name="plus" size={16} />
            New or manage workspaces
          </NavLink>
        </div>
      )}
    </div>
  );
}
