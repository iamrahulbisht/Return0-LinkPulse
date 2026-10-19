import { useMemo } from 'react';
import { SHORT_HOST } from '../../lib/api';

export interface JourneyStep {
  label: string;
  on: boolean;
}

/**
 * A QR-looking pattern for the preview only (finder squares + pseudo-random cells seeded by the code).
 * It is not scannable on purpose: the real QR is made by the API once the link exists.
 */
function previewPattern(seed: string): string {
  let s = 7;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const finder = (x: number, y: number, ox: number, oy: number): boolean | null => {
    const dx = x - ox;
    const dy = y - oy;
    if (dx < -1 || dy < -1 || dx > 7 || dy > 7) return null;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
  };
  const N = 21;
  let d = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = [finder(x, y, 0, 0), finder(x, y, 14, 0), finder(x, y, 0, 14)].filter((v): v is boolean => v !== null);
      const on = f.length ? f[0] : y === 6 ? x % 2 === 0 : x === 6 ? y % 2 === 0 : rnd() > 0.52;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
}

export function PreviewPanel({ code, host, journey, published }: { code: string; host: string | null; journey: JourneyStep[]; published: boolean }) {
  const path = useMemo(() => previewPattern(code || 'random'), [code]);
  return (
    <aside aria-label="Preview" className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
      <div className="flex flex-col gap-[18px] rounded-[20px] border border-line bg-surface p-6">
        <span className="text-[13px] font-bold uppercase tracking-[.08em] text-text-3">Preview</span>
        <div className="flex items-center gap-[18px]">
          <svg
            width="112"
            height="112"
            viewBox="-2 -2 25 25"
            aria-hidden="true"
            className="flex-none rounded-input border border-line bg-[#FFFFFF] p-1.5"
            shapeRendering="crispEdges"
          >
            <path d={path} fill="#0B0B0F" />
          </svg>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="break-all font-mono text-[19px] font-semibold text-fg">
              {SHORT_HOST}/{code || <span className="font-normal text-text-4">random code</span>}
            </span>
            <span className="truncate text-[13.5px] text-text-4">to {host ?? 'your destination'}</span>
            <span className="text-[13px] font-semibold text-accent-700">{published ? 'QR ready as PNG or SVG' : 'QR made as PNG or SVG when you publish'}</span>
          </div>
        </div>
        <div className="h-px bg-line-soft" />
        <span className="text-[14px] font-semibold">What a visitor goes through</span>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {journey.map((j, i) => (
            <li key={j.label} className="flex items-center gap-3 text-[14px]">
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-[7px] font-mono text-[12px] font-bold ${
                  j.on ? 'bg-ok-bg text-ok' : 'bg-bot-bg text-text-4'
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-fg">{j.label}</span>
              <span className={`text-[13px] font-semibold ${j.on ? 'text-ok' : 'text-text-4'}`}>{j.on ? 'On' : 'Off'}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
