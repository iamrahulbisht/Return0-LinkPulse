import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { MyAvatar } from '../components/Avatar';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import { Loading } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fmtNum, initials } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  badge?: number | null;
  /** What the badge number counts, for screen readers. */
  badgeLabel?: string;
  admin?: boolean;
  end?: boolean;
}

function NavItemLink({ item }: { item: NavItem }) {
  const { hash } = useLocation();
  // NavLink ignores the #part, so on /admin#audit all three admin items lit up. Match the section ourselves:
  // a "#section" item needs that hash, and the plain /admin item only counts when no section is open.
  const [, section] = item.to.split('#');
  const hashOk = section ? hash === `#${section}` : !(item.admin && hash);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-current={hashOk ? 'page' : 'false'}
      className={({ isActive }) =>
        `flex min-h-[44px] items-center gap-3 rounded-xl border px-3.5 text-[14.5px] no-underline transition-all ${
          isActive && hashOk
            ? 'border-[#2A2A34] bg-[#18181C] font-semibold text-accent-400'
            : 'border-transparent font-medium text-ondark-3 hover:bg-ink-3 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={isActive && hashOk ? 'text-accent-400' : ''}>
            <Icon name={item.icon} />
          </span>
          {item.label}
          {item.badge != null && item.badge > 0 && (
            <span
              className={`ml-auto rounded-full border px-2 py-0.5 font-mono text-[12px] ${item.admin ? 'border-transparent bg-admin font-bold text-black' : 'border-[#2B2B35] bg-[#1E1E24] text-ondark-3'}`}
              aria-label={`${item.badge} ${item.badgeLabel ?? (item.admin ? 'to review' : 'links')}`}
            >
              {fmtNum(item.badge)}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Brand({ isAdmin }: { isAdmin: boolean }) {
  return (
    <NavLink
      to="/"
      className="flex min-h-[44px] min-w-0 items-center gap-3 px-2 text-white no-underline hover:text-white"
    >
      <LogoMark size={36} />
      <span className="font-display text-[20px] font-bold uppercase tracking-tight">LinkPulse</span>
      {isAdmin && (
        <span className="rounded-md bg-admin px-[7px] py-[3px] text-[11px] font-bold tracking-[.08em] text-black">
          ADMIN
        </span>
      )}
    </NavLink>
  );
}

/** Everything in the sidebar below the logo. Shared by the pinned desktop sidebar and the phone/tablet drawer. */
function SidebarBody({ onSignOut }: { onSignOut: () => void }) {
  const { me } = useAuth();
  const isAdmin = me?.user.role === 'admin';
  const work: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/links', label: 'Links', icon: 'links', badge: me?.counts.links, end: true },
    { to: '/campaigns', label: 'Campaigns', icon: 'campaigns' },
    { to: '/qr', label: 'QR codes', icon: 'qr' },
    { to: '/import', label: 'Bulk import', icon: 'upload' },
    { to: '/bio', label: 'Bio pages', icon: 'phone' },
    {
      to: '/workspaces',
      label: 'Workspaces',
      icon: 'users',
      badge: me?.counts.invites,
      badgeLabel: 'invitations',
    },
  ];
  const adminItems: NavItem[] = [
    {
      to: '/admin',
      label: 'Abuse monitor',
      icon: 'shield',
      badge: me?.counts.openFlags,
      admin: true,
      end: true,
    },
    { to: '/admin/users', label: 'Users', icon: 'users' },
    { to: '/admin#blocklist', label: 'Domain blocklist', icon: 'ban' },
    { to: '/admin#audit', label: 'Audit log', icon: 'list' },
  ];
  return (
    <>
      <NavLink
        to="/links/new"
        className="flex min-h-[46px] flex-none items-center justify-center gap-2 rounded-xl bg-accent-400 font-brand text-[15px] font-bold text-black no-underline shadow-[0_2px_14px_rgba(212,255,0,0.25)] transition-all hover:bg-[#C4EC00] hover:text-black hover:shadow-[0_4px_20px_rgba(212,255,0,0.35)] active:scale-[0.98]"
      >
        <Icon name="plus" size={18} strokeWidth={2.8} />
        New link
      </NavLink>
      <WorkspaceSwitcher />
      <div className="flex flex-col gap-1">
        <span className="px-3 pb-2 text-[11.5px] font-bold uppercase tracking-wider text-ondark-4">
          Workspace
        </span>
        {work.map((i) => (
          <NavItemLink key={i.to} item={i} />
        ))}
      </div>
      {isAdmin && (
        <div className="flex flex-col gap-1">
          <span className="px-3 pb-2 text-[11.5px] font-bold uppercase tracking-wider text-ondark-4">
            Admin
          </span>
          {adminItems.map((i) => (
            <NavItemLink key={i.to} item={i} />
          ))}
        </div>
      )}
      <div
        className={`mt-auto flex items-center gap-3 rounded-xl border p-2.5 ${isAdmin ? 'border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.10)]' : 'border-[#202026] bg-surface'}`}
      >
        {/* The account card opens the profile page (photo, details, password, sessions). */}
        <NavLink
          to="/profile"
          aria-label={`Your profile: ${me?.user.name ?? ''}`}
          className={({ isActive }) =>
            `-m-1 flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg p-1 no-underline transition-colors hover:bg-white/[.05] ${isActive ? 'bg-white/[.05]' : ''}`
          }
        >
          {me?.user.avatarPath ? (
            <MyAvatar size={36} className={isAdmin ? 'border-admin' : ''} />
          ) : (
            <span
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[13px] font-bold ${isAdmin ? 'bg-admin text-black' : 'bg-[#202026] text-accent-400'}`}
            >
              {initials(me?.user.name ?? 'U')}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-white">
              {isAdmin ? me?.user.name : me?.workspace.name}
            </span>
            <span className={`truncate text-[12.5px] ${isAdmin ? 'text-[#FCD34D]' : 'text-ondark-3'}`}>
              {isAdmin
                ? 'Sees every workspace'
                : `${me?.workspace.role === 'member' ? 'Member' : 'Owner'} · ${me?.user.name ?? 'User'}`}
            </span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ondark-3 transition-colors hover:bg-white/[.06] hover:text-accent-400"
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
    </>
  );
}

/**
 * Phones and tablets (below 1024 px): the navigation slides in from the left. It closes on Escape, on a tap
 * outside, and after any navigation; focus stays inside while it is open and returns to the menu button after.
 */
function NavDrawer({
  open,
  onClose,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const { me } = useAuth();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const lock = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the page behind must not scroll
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
        if (!els.length) return;
        const [first, last] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = lock;
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        id="nav-drawer"
        className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col gap-6 overflow-y-auto overscroll-contain border-r border-[#1F1F24] bg-ink px-4 pb-6 pt-3 text-ondark-3 shadow-[0_25px_60px_rgba(0,0,0,.85)]"
      >
        <div className="flex items-center justify-between gap-2">
          <Brand isAdmin={me?.user.role === 'admin'} />
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ondark-3 hover:bg-white/[.06] hover:text-white"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <nav aria-label="App" className="flex flex-1 flex-col gap-6">
          <SidebarBody onSignOut={onSignOut} />
        </nav>
      </div>
    </div>
  );
}

/**
 * Dark sidebar + black workspace (new UI reference).
 * - Desktop (≥ 1024 px): the sidebar is pinned (sticky, full height, scrolls on its own) and only the content scrolls.
 * - Phones and tablets: a slim top bar (menu, logo, New link) and the same navigation in a drawer, so the page
 *   content starts at the top of the screen and gets the full width.
 */
export function AppLayout() {
  const { me, logout, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const isAdmin = me?.user.role === 'admin';
  const [drawer, setDrawer] = useState(false);
  // Stable, so the drawer's focus effect does not re-run (and steal focus) on every re-render.
  const closeDrawer = useCallback(() => setDrawer(false), []);

  useEffect(() => {
    // Move focus to the main area on page change, so keyboard and screen-reader users land on the content.
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  // Any navigation (including /admin#blocklist → #audit) closes the drawer.
  useEffect(() => setDrawer(false), [location.key]);

  // Invitations arrive while you work: re-check /auth/me every minute and when the tab gets focus.
  useEffect(() => {
    const tick = () => void refresh().catch(() => undefined);
    const id = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, [refresh]);

  const signOut = async () => {
    await logout();
    nav('/login');
  };
  // Something waiting in the menu: an invitation, or flags for an admin.
  const attention = (me?.counts.invites ?? 0) + (isAdmin ? (me?.counts.openFlags ?? 0) : 0);

  return (
    <div className="min-h-screen bg-ground font-sans text-fg lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-surface focus:px-4 focus:py-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[#1F1F24] bg-ink/95 px-3 backdrop-blur sm:px-5 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          aria-controls="nav-drawer"
          aria-label={attention ? `Open menu (${attention} waiting)` : 'Open menu'}
          className="relative flex h-11 w-11 flex-none items-center justify-center rounded-lg text-white hover:bg-white/[.06]"
        >
          <Icon name="menu" size={22} />
          {attention > 0 && (
            <span
              aria-hidden
              className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-ink ${isAdmin ? 'bg-admin' : 'bg-accent-400'}`}
            />
          )}
        </button>
        <NavLink
          to="/dashboard"
          className="flex min-h-[44px] min-w-0 items-center gap-2.5 text-white no-underline hover:text-white"
          aria-label="LinkPulse dashboard"
        >
          <LogoMark size={32} />
          <span className="truncate font-display text-[18px] font-bold uppercase tracking-tight">
            LinkPulse
          </span>
        </NavLink>
        <span className="hidden min-w-0 flex-1 truncate px-2 text-[13.5px] text-ondark-3 sm:block">
          {me?.workspace.name}
        </span>
        <NavLink
          to="/links/new"
          aria-label="New link"
          className="ml-auto flex h-11 flex-none items-center gap-1.5 rounded-xl bg-accent-400 px-3.5 font-brand text-[14.5px] font-bold text-black no-underline hover:bg-[#C4EC00] hover:text-black sm:ml-0"
        >
          <Icon name="plus" size={17} strokeWidth={2.8} />
          <span className="hidden min-[400px]:inline">New link</span>
        </NavLink>
      </header>
      <NavDrawer open={drawer} onClose={closeDrawer} onSignOut={signOut} />

      <nav
        aria-label="App"
        className="hidden w-[256px] flex-none flex-col gap-6 overflow-y-auto overscroll-contain border-r border-[#1F1F24] bg-ink px-4 py-6 text-ondark-3 lg:sticky lg:top-0 lg:flex lg:h-screen xl:w-[272px]"
      >
        <Brand isAdmin={isAdmin} />
        <SidebarBody onSignOut={signOut} />
      </nav>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col gap-6 px-4 pb-14 pt-6 outline-none sm:px-6 lg:px-8 lg:pt-7"
      >
        {/* Pages load as separate chunks; keep the navigation on screen while one loads. */}
        <Suspense fallback={<Loading />}>
          {/* Keyed by the active workspace: switching re-mounts the page, so all its data reloads. */}
          <Fragment key={me?.workspace.id}>
            <Outlet />
          </Fragment>
        </Suspense>
      </main>
    </div>
  );
}
