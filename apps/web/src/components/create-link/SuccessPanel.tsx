import { forwardRef } from 'react';
import type { Link, QrCode } from '../../types';
import { api, SHORT_HOST } from '../../lib/api';
import { ButtonLink, ShortLink } from '../ui';
import { Icon } from '../Icon';
import { useToast } from '../../hooks/useToast';
import { useCopy } from './useCopy';

const ON_DARK_BTN =
  'inline-flex min-h-[46px] items-center gap-2 rounded-input border-[1.5px] border-white/30 bg-transparent px-[18px] text-[15px] font-semibold text-white no-underline hover:bg-white/[.08] hover:text-white';

/** Step 3: the dark "Your link is live." card. The heading takes focus when it appears. */
export const SuccessPanel = forwardRef<HTMLHeadingElement, { link: Link; qr: QrCode | null; onReset: () => void }>(function SuccessPanel({ link, qr, onReset }, ref) {
  const { copied, copy } = useCopy();
  const toast = useToast();
  const display = `${SHORT_HOST}/${link.code}`;

  return (
    <section className="flex flex-col gap-6 rounded-[20px] bg-ink p-6 text-white sm:p-10">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#22C55E] text-fg">
        <Icon name="check" size={28} strokeWidth={3} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 ref={ref} tabIndex={-1} className="m-0 font-display text-[36px] font-bold tracking-[-0.025em] outline-none">
          Your link is live.
        </h1>
        <p className="m-0 text-[16px] text-ondark-2">Share it anywhere. Clicks will show on your dashboard within seconds.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/[.12] bg-ink-3 px-[18px] py-4">
        <ShortLink code={link.code} className="min-w-0 text-[24px] text-accent-300" />
        <button
          type="button"
          onClick={async () => {
            if (!(await copy(link.shortUrl))) toast('Could not copy. Select the link and copy it by hand.', 'error');
          }}
          className="h-[46px] rounded-[10px] bg-surface px-5 text-[15px] font-bold text-fg hover:bg-line-soft"
        >
          <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
        </button>
      </div>

      {qr && (
        <div className="flex flex-wrap items-center gap-5">
          <img src={api.qr.pngUrl(qr.id)} alt={`QR code for ${display}`} width={148} height={148} className="h-[148px] w-[148px] flex-none rounded-input bg-[#FFFFFF] p-2" />
          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">Main QR code</span>
            <span className="text-[13.5px] text-ondark-3">Print it on posters. Scans are counted as QR visits.</span>
            <div className="flex flex-wrap gap-2.5">
              <a href={api.qr.pngUrl(qr.id, true)} download className={ON_DARK_BTN}>
                <Icon name="download" size={17} />
                PNG
              </a>
              <a href={api.qr.svgUrl(qr.id, true)} download className={ON_DARK_BTN}>
                <Icon name="download" size={17} />
                SVG
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <ButtonLink to={`/links/${link.id}`} variant="primary" className="min-h-[48px]">
          View link details
        </ButtonLink>
        <button type="button" onClick={onReset} className={ON_DARK_BTN}>
          Create another
        </button>
      </div>
    </section>
  );
});
