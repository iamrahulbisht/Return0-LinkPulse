/**
 * The LinkPulse mark from the dark UI reference: a lime pulse in a near-black tile.
 * Props are unchanged from the earlier mark so every caller keeps working.
 */
export function LogoMark({ size = 30, tile = true, onLight = false }: { size?: number; tile?: boolean; onLight?: boolean }) {
  const pulse = !tile && onLight ? '#0A0A0C' : '#D4FF00';
  const inner = Math.round(size * 0.62);
  const svg = (
    <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={pulse} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h3l2-5 4 10 2-5h5" />
    </svg>
  );
  if (!tile) return svg;
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-xl border border-line-strong bg-ink-3 shadow-[0_0_12px_rgba(212,255,0,0.15)]"
      style={{ width: size, height: size }}
    >
      {svg}
    </span>
  );
}

export function Logo({ size = 30, dark = true, className = '' }: { size?: number; dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-display text-[20px] font-bold uppercase tracking-tight ${dark ? 'text-white' : 'text-fg'}`}>LinkPulse</span>
    </span>
  );
}
