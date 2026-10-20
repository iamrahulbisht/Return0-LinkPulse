import type { CSSProperties, ReactNode } from 'react';
import { PULSE } from './data';

interface MarkProps {
  size?: number;
  /** 'edge' = dark tile with its #2A2A32 edge, 'plain' = dark tile, 'none' = no tile. */
  tile?: 'edge' | 'plain' | 'none';
  tileFill?: string;
  pulse?: string | null;
  stroke?: number;
  /** Lime glow around the tile (as in the sidebar and sign-in card). */
  glow?: boolean;
  /** Accessible name; without it the drawing is decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** The LinkPulse mark (lime pulse in a dark tile) with every part switchable, for the logo anatomy and "don't" examples. */
export function Mark({ size = 48, tile = 'edge', tileFill = '#141416', pulse = '#D4FF00', stroke = 2.6, glow = false, label, className, style }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ ...(glow ? { filter: 'drop-shadow(0 0 10px rgba(212,255,0,.25))' } : {}), ...style }}
    >
      {tile !== 'none' && <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill={tileFill} stroke={tile === 'edge' ? '#2A2A32' : undefined} />}
      {pulse && <path d={PULSE} fill="none" stroke={pulse} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function SectionHead({ id, overline, title, children }: { id: string; overline: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-2.5">
      <span className="text-[13px] font-bold uppercase tracking-wider text-accent-400">{overline}</span>
      <h2 id={`${id}-title`} className="m-0 font-display text-[34px] font-bold leading-[1.05] tracking-tight text-fg sm:text-[46px]">
        {title}
      </h2>
      {children && <p className="m-0 text-[16.5px] leading-[1.6] text-text-3">{children}</p>}
    </div>
  );
}

/** Dark code panel with a copy button in its header. */
export function CodePanel({ file, code, buttonLabel, onCopy }: { file: string; code: string; buttonLabel: string; onCopy: () => void }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-ink">
      <div className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-2">
        <span className="font-mono text-[13px] text-accent-300">{file}</span>
        <button
          type="button"
          onClick={onCopy}
          className="min-h-[44px] cursor-pointer rounded-chip border-0 bg-accent-400 px-3 font-brand text-[13px] font-bold text-black transition-colors hover:bg-[#C4EC00]"
        >
          {buttonLabel}
        </button>
      </div>
      <pre tabIndex={0} aria-label={`${file} code`} className="m-0 overflow-x-auto whitespace-pre p-[18px] font-mono text-[13px] leading-[1.65] text-text-2">
        {code}
      </pre>
    </div>
  );
}
