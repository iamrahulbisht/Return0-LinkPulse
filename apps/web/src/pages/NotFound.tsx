import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogoMark } from '../components/Logo';

/** 404 for unknown app routes, in the same style as the visitor status pages. */
export function NotFound() {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const next = me ? { to: '/dashboard', label: 'Go to dashboard' } : { to: '/', label: 'Go to LinkPulse home' };

  return (
    <div className="flex min-h-screen justify-center bg-[#16161A] px-4 py-8 font-sans text-fg sm:items-center">
      <main className="flex w-full max-w-[420px] flex-col self-start overflow-hidden rounded-[28px] bg-surface shadow-[0_30px_60px_-30px_rgba(11,19,36,.35)] sm:self-auto">
        <div className="relative flex h-[240px] items-center justify-center bg-accent-50">
          <span className="flex h-28 w-28 items-center justify-center rounded-[34px] bg-surface shadow-[0_16px_32px_-14px_rgba(11,19,36,.35)]">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#D4FF00" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M9 9l4 4M13 9l-4 4" />
            </svg>
          </span>
          <span className="absolute inset-x-4 bottom-5 truncate text-center font-mono text-[14px] font-semibold text-accent-700">{pathname}</span>
        </div>
        <div className="flex flex-col gap-3.5 px-[26px] py-8">
          <span className="font-mono text-[13px] font-semibold text-accent-700">404</span>
          <h1 className="m-0 font-display text-[30px] font-bold leading-[1.08] tracking-[-0.02em]">We can’t find this page</h1>
          <p className="m-0 text-[16.5px] leading-[1.55] text-text-2">There is no page at this address. It may have a typo, or the page has moved.</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <Link to={next.to} className="flex h-14 items-center justify-center rounded-[14px] bg-ink text-[16.5px] font-bold text-white no-underline hover:bg-ink-4 hover:text-white">
              {next.label}
            </Link>
          </div>
          <span className="mt-2 flex items-center justify-center gap-2 text-[13px] text-text-4">
            <LogoMark size={15} />
            LinkPulse
          </span>
        </div>
      </main>
    </div>
  );
}
