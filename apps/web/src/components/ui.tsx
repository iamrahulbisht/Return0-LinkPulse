// Shared building blocks, styled to the dark "LinkPulse Frontend" reference. Rules kept from the brand guide:
// - touch targets ≥ 44 px, real <button>/<a>/<input>+<label>
// - one lime (primary) button per area
// - status never by colour alone: always a dot or icon plus a word
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Link as RouterLink, type LinkProps } from 'react-router-dom';
import type { ClickType, LinkStatus } from '../types';
import { SHORT_HOST } from '../lib/api';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'dark' | 'danger' | 'ghost';
type Size = 'md' | 'lg' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent-400 text-black font-brand font-bold border-0 shadow-[0_2px_14px_rgba(212,255,0,0.25)] hover:bg-[#C4EC00] hover:shadow-[0_4px_20px_rgba(212,255,0,0.35)] active:scale-[0.98]',
  secondary: 'bg-field text-fg font-semibold border border-line-strong hover:bg-[#25252C]',
  dark: 'bg-[#1E1E24] text-white font-semibold border border-line-strong hover:bg-[#2A2A32]',
  danger: 'bg-danger-solid text-white font-brand font-bold border-0 hover:bg-[#EF4444]',
  ghost: 'bg-transparent text-accent-700 font-semibold border-0 hover:text-accent-800 hover:underline',
};
const SIZE: Record<Size, string> = {
  sm: 'h-11 px-3.5 text-[14px] rounded-input', // still 44 px
  md: 'h-[46px] px-[18px] text-[15px] rounded-input',
  lg: 'h-14 px-6 text-[16.5px] rounded-[14px]',
};
const DISABLED =
  'disabled:bg-[#1E1E24] disabled:text-text-4 disabled:border-0 disabled:shadow-none disabled:cursor-not-allowed disabled:scale-100';

export function btnClass(variant: Variant = 'secondary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-2 cursor-pointer transition ${VARIANT[variant]} ${SIZE[size]} ${DISABLED} ${extra}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    busy,
    className = '',
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={btnClass(variant, size, className)}
      {...rest}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={17} /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <RouterLink className={`${btnClass(variant, size, className)} no-underline`} {...rest}>
      {icon && <Icon name={icon} size={17} />}
      {children}
    </RouterLink>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none ${className}`}
    />
  );
}

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<
  string,
  unknown
>) {
  return (
    <Tag className={`min-w-0 rounded-card border border-line bg-surface p-4 sm:p-6 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardTitle({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2 id={id} className={`m-0 font-display text-[19px] font-bold tracking-tight text-fg ${className}`}>
      {children}
    </h2>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <h1 className="m-0 font-display text-[28px] font-bold tracking-tight text-fg sm:text-[32px]">
          {title}
        </h1>
        {subtitle && <span className="text-[14.5px] text-text-4">{subtitle}</span>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

const STATUS: Record<LinkStatus, { label: string; cls: string; dot: string }> = {
  active: { label: 'Active', cls: 'bg-ok-bg text-ok border border-ok-line', dot: 'bg-ok' },
  expired: { label: 'Expired', cls: 'bg-warn-bg text-warn border border-warn-line', dot: 'bg-warn' },
  limit_reached: {
    label: 'Limit reached',
    cls: 'bg-limit-bg text-limit border border-limit-line',
    dot: 'bg-limit',
  },
  disabled: {
    label: 'Disabled by admin',
    cls: 'bg-danger-bg text-danger border border-danger-line',
    dot: 'bg-danger',
  },
};
export const statusLabel = (s: LinkStatus) => STATUS[s].label;

/** Dot + word, never colour alone. */
export function StatusBadge({ status, label }: { status: LinkStatus; label?: string }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${s.cls}`}
    >
      <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}

const CLICK: Record<ClickType, { label: string; cls: string }> = {
  human: { label: 'Human', cls: 'bg-ok-bg text-ok border border-ok-line' },
  preview_bot: { label: 'Preview bot', cls: 'bg-bot-bg text-bot border border-bot-line' },
  scanner: { label: 'Scanner', cls: 'bg-bot-bg text-bot border border-bot-line' },
  suspicious: { label: 'Suspicious', cls: 'bg-warn-bg text-warn border border-warn-line' },
};

/** Bots have their own colour (sky blue in the dark theme) and always say "not counted". */
export function ClickTypeBadge({ type, counted }: { type: ClickType; counted?: boolean }) {
  const c = CLICK[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${c.cls}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {c.label}
      {type !== 'human' && <span className="font-normal">· not counted</span>}
      {type === 'human' && counted === false && <span className="font-normal">· not counted</span>}
    </span>
  );
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-chip border border-[#2E3608] bg-accent-50 px-2 py-0.5 text-[12.5px] font-semibold text-accent-400 ${className}`}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  note,
  tone = 'default',
  icon,
  badge,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'bot';
  icon?: IconName;
  badge?: ReactNode;
}) {
  const bot = tone === 'bot';
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-[#2F2F38] sm:p-5">
      <span className="flex items-center gap-2 text-[13.5px] font-medium text-text-4">
        {icon && <Icon name={icon} size={16} className={bot ? 'text-bot' : ''} />}
        {label}
      </span>
      <div className="flex items-baseline gap-2.5">
        <span
          className={`font-display text-[28px] font-bold leading-none tracking-tight sm:text-[34px] ${bot ? 'text-bot' : 'text-fg'}`}
        >
          {value}
        </span>
        {badge}
      </div>
      {note && <span className="text-[13px] text-text-4">{note}</span>}
    </div>
  );
}

/** "+18%" in green, "−5%" in red, with the word for screen readers. */
export function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return (
      <span className="rounded-full bg-[#1E1E24] px-2 py-[3px] text-[12.5px] font-bold text-text-3">new</span>
    );
  const up = pct >= 0;
  return (
    <span
      className={`rounded-full px-2 py-[3px] text-[12.5px] font-bold ${up ? 'bg-accent-400/10 text-accent-400' : 'bg-danger-bg text-danger'}`}
    >
      <span className="sr-only">{up ? 'up' : 'down'} </span>
      {up ? '+' : '−'}
      {Math.abs(pct)}%
    </span>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  success?: string | null;
  prefix?: ReactNode;
  mono?: boolean;
}

/** Input + label + message under the field, in plain words. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  // autoComplete defaults to off: the browser's list of earlier entries (old URLs, aliases) is noise here.
  // Login and profile fields pass their own value (name, email, password) and keep the browser's help.
  { label, hint, error, success, prefix, mono, className = '', id, autoComplete = 'off', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const border = error
    ? 'border-2 border-[#DC2626]'
    : success
      ? 'border-2 border-[#16A34A]'
      : 'border border-line-strong focus-within:border-accent-400';
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-[13.5px] font-semibold text-text-3">
        {label}
      </label>
      <div
        className={`flex h-[46px] items-center overflow-hidden rounded-input bg-field focus-within:shadow-[0_0_0_3px_rgba(212,255,0,.16)] ${border}`}
      >
        {prefix && (
          <span className="flex h-full items-center border-r border-line-strong bg-[#16161A] px-3 font-mono text-[14px] text-text-4">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || success || hint ? msgId : undefined}
          className={`h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] text-fg outline-none ${mono ? 'font-mono' : ''}`}
          autoComplete={autoComplete}
          {...rest}
        />
      </div>
      {(error || success || hint) && (
        <span
          id={msgId}
          aria-live="polite"
          className={`text-[13.5px] ${error ? 'font-semibold text-danger' : success ? 'font-semibold text-ok' : 'text-text-4'}`}
        >
          {error ?? success ?? hint}
        </span>
      )}
    </div>
  );
});

export function Select({
  label,
  children,
  className = '',
  inline,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; inline?: boolean }) {
  const id = useId();
  return (
    <div
      className={`flex min-w-0 max-w-full ${inline ? 'flex-row items-center gap-2' : 'flex-col gap-1.5'} ${className}`}
    >
      <label htmlFor={id} className="flex-none text-[13.5px] font-semibold text-text-3">
        {label}
      </label>
      {/* A native select is as wide as its longest option (a long campaign name pushed phones sideways): cap it. */}
      <select
        id={id}
        className={`h-11 min-w-0 cursor-pointer truncate rounded-input border border-line-strong bg-field px-3 text-[14px] text-fg outline-none focus:border-accent-400 ${inline ? 'max-w-[min(18rem,calc(100vw-7rem))]' : 'w-full'}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

/** On/off switch (role="switch"), 44 px tall hit area. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 items-center"
    >
      <span
        className={`relative inline-block h-7 w-[52px] rounded-full transition-colors ${checked ? 'bg-accent-600' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-[#FFFFFF] shadow transition-[left] ${checked ? 'left-[28px]' : 'left-1'}`}
        />
      </span>
    </button>
  );
}

/** Modal dialog: focus moves in, Escape closes, focus goes back on close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const titleId = labelledBy ?? autoId;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const els = [
          ...ref.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea',
          ),
        ];
        if (!els.length) return;
        const [a, b] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[480px] flex-col gap-[18px] rounded-card border border-line-strong bg-ink-3 p-7 shadow-[0_25px_60px_rgba(0,0,0,.85)]"
      >
        <h2 id={titleId} className="m-0 font-display text-[22px] font-bold tracking-tight text-fg">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon = 'search',
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-field text-accent-400 shadow-inner">
        <Icon name={icon} size={24} />
      </span>
      <span className="font-display text-[19px] font-bold text-fg">{title}</span>
      {body && <span className="max-w-md text-[14.5px] text-text-3">{body}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-[14px] border border-danger-line bg-danger-bg p-4 text-[14.5px] text-[#FCA5A5]"
    >
      <Icon name="warn" className="text-danger" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Grey shimmer blocks while data loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-input bg-line-soft motion-reduce:animate-none ${className}`}
    />
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-[14.5px] text-text-3">
      <Spinner />
      {label}
    </div>
  );
}

/** Green "Live · updated 3 s ago" chip with the ping dot (no animation if reduced motion). */
export function LiveChip({ text, tone = 'live' }: { text: string; tone?: 'live' | 'poll' }) {
  const live = tone === 'live';
  return (
    <span
      className={`flex h-9 items-center gap-2.5 rounded-full border px-3.5 text-[13.5px] font-medium ${live ? 'border-ok-line bg-ok-bg text-ok' : 'border-line-strong bg-[#16161A] text-text-3'}`}
      aria-live="off"
    >
      <span className="relative inline-block h-2 w-2">
        {live && (
          <span className="absolute inset-0 animate-ping rounded-full bg-[#4ADE80] opacity-75 motion-reduce:animate-none" />
        )}
        <span className={`absolute inset-0 rounded-full ${live ? 'bg-[#22C55E]' : 'bg-text-4'}`} />
      </span>
      {text}
    </span>
  );
}

/** Thin progress bar. */
export function Bar({
  pct,
  color = '#D4FF00',
  className = 'h-1.5 w-[90px]',
  track = '#1E1E24',
}: {
  pct: number;
  color?: string;
  className?: string;
  track?: string;
}) {
  return (
    <span
      className={`inline-block overflow-hidden rounded-[3px] ${className}`}
      style={{ background: track }}
      aria-hidden
    >
      <span
        className="block h-full rounded-[3px]"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </span>
  );
}

export function ShortLink({ code, className = '' }: { code: string; className?: string }) {
  return (
    // <wbr> lets a narrow screen wrap after the slash instead of in the middle of the code.
    <span className={`font-mono font-semibold [overflow-wrap:anywhere] ${className}`}>
      {shortHost()}/<wbr />
      {code}
    </span>
  );
}

export const shortHost = () => SHORT_HOST;
