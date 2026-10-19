import { useEffect, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { LogoMark } from '../components/Logo';
import { Spinner } from '../components/ui';
import { BioButton } from '../components/bio/BioButton';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-ink font-sans text-white">
      <div className="flex w-full max-w-[430px] flex-col gap-7 px-5 pb-6 pt-14">{children}</div>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-auto flex flex-col items-center gap-2 pt-4">
      <RouterLink
        to="/"
        className="flex min-h-[44px] items-center gap-2 rounded-full bg-white/[.08] px-3.5 text-[13.5px] text-[#C6C6CF] no-underline hover:bg-white/[.12] hover:text-white"
      >
        <LogoMark size={16} />
        Make your own page with LinkPulse
      </RouterLink>
    </div>
  );
}

export function PublicBio() {
  const { slug = '' } = useParams();
  const page = useAsync(() => api.bio.public(slug), [slug]);
  const data = page.data;
  // The API answers 400 for a malformed slug and 404 for an unknown one; to a visitor both mean "no such page".
  const notFound = page.error && (page.error.status === 404 || page.error.status === 400);

  useEffect(() => {
    const prev = document.title;
    if (data) document.title = data.title;
    else if (notFound) document.title = 'Page not found · LinkPulse';
    return () => {
      document.title = prev;
    };
  }, [data, notFound]);

  if (page.loading && !data) {
    return (
      <Shell>
        <div role="status" className="flex flex-1 items-center justify-center gap-3 text-[15px] text-ondark-2">
          <Spinner />
          Loading…
        </div>
      </Shell>
    );
  }

  if (page.error || !data) {
    return (
      <Shell>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="font-display text-[56px] font-extrabold leading-none text-accent-400" aria-hidden>
            {notFound ? '404' : '!'}
          </span>
          <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">{notFound ? 'This page does not exist' : 'Could not load this page'}</h1>
          <p className="m-0 max-w-[300px] text-[15.5px] leading-normal text-ondark-2">
            {notFound ? 'Check the address. It may have a typo, or the page was removed.' : page.error?.message}
          </p>
          {notFound ? (
            <RouterLink to="/" className="flex min-h-[46px] items-center rounded-input bg-accent-400 px-5 text-[15px] font-bold text-black no-underline hover:text-black hover:brightness-[1.07]">
              Go to LinkPulse
            </RouterLink>
          ) : (
            <button
              type="button"
              onClick={() => void page.reload()}
              className="flex min-h-[46px] cursor-pointer items-center rounded-input border-0 bg-accent-400 px-5 text-[15px] font-bold text-black hover:brightness-[1.07]"
            >
              Try again
            </button>
          )}
        </main>
        <Footer />
      </Shell>
    );
  }

  // Featured = first open link that has a closing date (the design's "Closes 30 Oct" card).
  const featuredIdx = data.links.findIndex((l) => l.expiresAt && l.status === 'active');

  return (
    <Shell>
      <header className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="flex h-[88px] w-[88px] -rotate-[4deg] items-center justify-center rounded-[28px] bg-[#1C1C22] font-display text-[34px] font-extrabold tracking-[-0.04em] text-accent-400"
        >
          {data.initials}
        </span>
        <h1 className="m-0 break-words font-display text-[28px] font-bold tracking-[-0.02em]">{data.title}</h1>
        {data.description && <p className="m-0 max-w-[300px] text-[15.5px] leading-normal text-ondark-2">{data.description}</p>}
      </header>

      <main>
        {data.links.length === 0 ? (
          <p className="m-0 rounded-[20px] border border-[#2A2A33] p-5 text-center text-[15px] text-ondark-2">No links here yet. Check back soon.</p>
        ) : (
          <nav aria-label={`${data.title} links`}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.links.map((l, i) => (
                // The label alone is not unique, so the position is part of the key.
                <li key={`${i}-${l.href}`}>
                  <BioButton link={l} featured={i === featuredIdx} />
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>

      <Footer />
    </Shell>
  );
}
