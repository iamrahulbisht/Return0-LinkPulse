import { SHORT_HOST, api } from '../../lib/api';
import { fmtNum } from '../../lib/format';
import type { QrCode } from '../../types';
import { Icon } from '../Icon';
import { ShortLink } from '../ui';

const DL = 'inline-flex h-11 items-center gap-1.5 rounded-[9px] border-[1.5px] border-line bg-surface px-3 text-[13px] font-semibold text-fg no-underline hover:bg-bot-bg hover:text-fg';

export function QrCard({ qr }: { qr: QrCode }) {
  const where = `${SHORT_HOST}/${qr.code} at ${qr.locationLabel}`;
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex justify-center rounded-[14px] bg-subtle p-3.5">
        <img
          src={api.qr.pngUrl(qr.id)}
          alt={`QR code for ${where}`}
          width={132}
          height={132}
          loading="lazy"
          className="h-[132px] w-[132px] rounded-[8px] bg-[#FFFFFF]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="break-words text-[16px] font-bold">{qr.locationLabel}</span>
        <ShortLink code={qr.code} className="truncate text-[13px] !font-normal text-text-3" />
      </div>
      {qr.warning && (
        <span className="flex items-start gap-2 rounded-[10px] bg-warn-bg px-2.5 py-2 text-[13px] text-warn">
          <Icon name="warn" size={15} strokeWidth={2.2} className="mt-px flex-none" />
          {qr.warning}
        </span>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-text-2">
          <span className="font-mono text-[16px] font-bold text-fg">{fmtNum(qr.scans)}</span> {qr.scans === 1 ? 'scan' : 'scans'}
        </span>
        <div className="flex gap-1.5">
          <a href={api.qr.pngUrl(qr.id, true)} download className={DL} aria-label={`Download PNG of the QR code for ${where}`}>
            <Icon name="download" size={14} />
            PNG
          </a>
          <a href={api.qr.svgUrl(qr.id, true)} download className={DL} aria-label={`Download SVG of the QR code for ${where}`}>
            <Icon name="download" size={14} />
            SVG
          </a>
        </div>
      </div>
    </article>
  );
}
