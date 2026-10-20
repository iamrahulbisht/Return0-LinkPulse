import { forwardRef, useId, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Loading } from '../components/ui';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';

type Mode = 'signin' | 'signup';
type FieldName = 'name' | 'email' | 'password' | 'confirmPassword';

/** Only same-app paths, so a crafted link cannot send people to another site after sign-in. */
function safeFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
}

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Right-side slot inside the box (the Show/Hide button). */
  trailing?: ReactNode;
}

const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput({ label, error, hint, trailing, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      {/* The reference shows placeholders only; the label stays for screen readers. */}
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative flex">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          placeholder={label}
          className={`h-12 min-w-0 flex-1 rounded-[10px] bg-field px-4 text-[15px] text-fg outline-none transition-[border-color,box-shadow,background-color] focus:border-accent-400 focus:bg-[#1F1F24] focus:shadow-[0_0_0_3px_rgba(212,255,0,.16)] ${
            trailing ? 'pr-[72px]' : ''
          } ${error ? 'border-2 border-[#DC2626]' : 'border border-line-strong'}`}
          {...rest}
        />
        {trailing}
      </div>
      {(error || hint) && (
        <span id={msgId} className={`px-1 text-[13px] ${error ? 'font-semibold text-danger' : 'text-text-4'}`}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});

export function Login() {
  const { me, loading, login, signup } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = safeFrom(location.state);

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <Loading label="Opening LinkPulse…" />
      </div>
    );
  }
  // Same target as after a fresh sign-in, so the two redirects never race to different pages.
  if (me) return <Navigate to={from} replace />;

  const signup_ = mode === 'signup';

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setFieldErrors({});
    setShow(false);
    setShowConfirm(false);
    setConfirmPassword('');
  };

  const focusFirst = (errs: Partial<Record<FieldName, string>>) => {
    if (errs.name) nameRef.current?.focus();
    else if (errs.email) emailRef.current?.focus();
    else if (errs.password) passwordRef.current?.focus();
    else if (errs.confirmPassword) confirmPasswordRef.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<FieldName, string>> = {};
    if (signup_ && !name.trim()) errs.name = 'Enter your name.';
    if (!email.trim()) errs.email = 'Enter your email.';
    if (!password) errs.password = 'Enter your password.';
    else if (signup_ && password.length < 8) errs.password = 'Use at least 8 characters.';
    if (signup_) {
      if (!confirmPassword) errs.confirmPassword = 'Confirm your password.';
      else if (password && confirmPassword !== password) errs.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errs);
    setError(null);
    if (Object.keys(errs).length) {
      focusFirst(errs);
      return;
    }
    setBusy(true);
    try {
      if (signup_) await signup(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      nav(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const f: Partial<Record<FieldName, string>> = {};
        for (const k of ['name', 'email', 'password'] as const) {
          const m = err.fieldMessage(k);
          if (m) f[k] = m;
        }
        setFieldErrors(f);
        setError(err.message);
        focusFirst(f);
      } else {
        setError('Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ground px-4 py-16 font-sans text-fg">
      <Link
        to="/"
        className="absolute left-4 top-5 flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-medium text-text-4 no-underline transition-colors hover:text-accent-400 sm:left-6"
      >
        &larr; Back to LinkPulse
      </Link>

      <main className="w-full max-w-[416px] rounded-[20px] border border-line bg-ink-3 px-6 pb-8 pt-9 shadow-[0_25px_60px_rgba(0,0,0,0.85)] sm:px-8">
        {/* Brand header: logo + wordmark, centred like the reference auth card. */}
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 drop-shadow-[0_2px_8px_rgba(212,255,0,0.2)]">
            <LogoMark size={50} />
          </span>
          <span className="font-zentry text-[34px] font-black uppercase leading-[1.1] tracking-[-0.02em] text-white">LinkPulse</span>

        </div>
        

        <form onSubmit={submit} noValidate aria-describedby={error ? errorId : undefined} className="flex w-full flex-col gap-3.5">
          <div className="mb-1 flex flex-col gap-1">
            <h1 className="m-0 font-display text-[22px] font-bold tracking-tight">{signup_ ? 'Create an account' : 'Sign in'}</h1>
            <p className="m-0 text-[14px] text-text-4">
              {signup_ ? 'Make links, campaigns and QR codes in one place.' : 'Welcome back. Use your email.'}
            </p>
          </div>
          {signup_ && (
            <AuthInput
              ref={nameRef}
              label="Your name"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
            />
          )}

          <AuthInput
            ref={emailRef}
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />

          <AuthInput
            ref={passwordRef}
            label="Password"
            type={show ? 'text' : 'password'}
            autoComplete={signup_ ? 'new-password' : 'current-password'}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            hint={signup_ ? 'Use at least 8 characters.' : undefined}
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-pressed={show}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-0.5 h-11 min-w-[56px] cursor-pointer rounded-[8px] border-0 bg-transparent px-2 text-[13.5px] font-semibold text-text-4 transition-colors hover:text-accent-400"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            }
          />

          {signup_ && (
            <AuthInput
              ref={confirmPasswordRef}
              label="Confirm password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={200}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-pressed={showConfirm}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-0.5 h-11 min-w-[56px] cursor-pointer rounded-[8px] border-0 bg-transparent px-2 text-[13.5px] font-semibold text-text-4 transition-colors hover:text-accent-400"
                >
                  {showConfirm ? 'Hide' : 'Show'}
                </button>
              }
            />
          )}

          {error && (
            <p id={errorId} role="alert" className="m-0 flex items-start gap-2 rounded-lg border border-[rgba(255,77,77,0.3)] bg-[rgba(255,77,77,0.12)] px-3.5 py-3 text-[13.5px] font-medium text-[#FF8A8A]">
              <Icon name="warn" size={17} className="mt-px flex-none" />
              {error}
            </p>
          )}

          {/* White call to action that turns lime on hover, like the reference. */}
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy || undefined}
            className="mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 bg-white font-brand text-[15.5px] font-bold tracking-[-0.01em] text-black transition-all hover:bg-accent-400 hover:shadow-[0_4px_20px_rgba(212,255,0,0.3)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#1E1E24] disabled:text-text-4 disabled:shadow-none"
          >
            {busy && <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
            {busy ? (signup_ ? 'Creating account…' : 'Signing in…') : signup_ ? 'Create account' : 'Sign in'}
          </button>

          <p className="m-0 mt-4 text-center text-[14px] text-text-4">
            {signup_ ? 'Have an account? ' : 'New here? '}
            <button
              type="button"
              onClick={() => switchMode(signup_ ? 'signin' : 'signup')}
              className="min-h-[44px] cursor-pointer border-0 bg-transparent px-1 font-semibold text-accent-400 hover:underline"
            >
              {signup_ ? 'Sign in' : 'Create an account'}
            </button>
          </p>

          
        </form>
      </main>
      
    </div>
  );
}
