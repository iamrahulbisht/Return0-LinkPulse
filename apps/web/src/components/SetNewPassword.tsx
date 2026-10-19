import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Button, ErrorState, Field } from './ui';
import { Logo } from './Logo';
import { Icon } from './Icon';

type Errors = Partial<Record<'currentPassword' | 'newPassword' | 'confirm', string>>;

/**
 * Shown instead of the app after an admin reset the password (`me.passwordReset`), whatever page was opened.
 * The API refuses everything else until this is done (PASSWORD_CHANGE_REQUIRED), so this is the only way on.
 */
export function SetNewPassword({ reason }: { reason: string | null }) {
  const { refresh, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v: Errors = {};
    if (!current) v.currentPassword = 'Enter the temporary password from the admin.';
    if (next.length < 8) v.newPassword = 'Use at least 8 characters.';
    else if (next === current) v.newPassword = 'Pick a password of your own, not the temporary one.';
    if (confirm !== next) v.confirm = 'The two new passwords do not match.';
    setErrs(v);
    setGeneral(null);
    if (Object.values(v).some(Boolean)) return;
    setBusy(true);
    try {
      await api.profile.changePassword(current, next);
      // /auth/me no longer reports a reset, so RequireAuth shows the page that was asked for.
      await refresh();
    } catch (err) {
      setBusy(false);
      if (!(err instanceof ApiError)) {
        setGeneral('Could not save. Please try again.');
        return;
      }
      const field: Errors = {};
      for (const f of err.fields) if (f.field === 'currentPassword' || f.field === 'newPassword') field[f.field] ??= f.message;
      setErrs(field);
      if (!Object.keys(field).length) setGeneral(err.message);
    }
  }

  const type = show ? 'text' : 'password';
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col gap-6 rounded-[20px] border border-line bg-surface p-6 sm:p-8">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[26px] font-bold tracking-tight">Set a new password</h1>
          <p className="m-0 text-[15px] leading-[1.55] text-text-3">
            A platform admin reset your password. Choose your own to continue. Your links, QR codes and analytics are all still here.
          </p>
          {reason && (
            <p className="m-0 flex items-start gap-2.5 rounded-[14px] border border-line bg-subtle p-3.5 text-[14px] text-text-2">
              <Icon name="shield" className="mt-px flex-none text-admin" />
              <span>Reason from the admin: {reason}</span>
            </p>
          )}
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            label="Temporary password"
            type={type}
            autoComplete="current-password"
            maxLength={200}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={errs.currentPassword}
            hint="The one the admin gave you."
          />
          <Field
            label="New password"
            type={type}
            autoComplete="new-password"
            maxLength={200}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errs.newPassword}
            hint="At least 8 characters."
          />
          <Field
            label="Repeat new password"
            type={type}
            autoComplete="new-password"
            maxLength={200}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errs.confirm}
          />
          <Button size="sm" variant="ghost" className="self-start" aria-pressed={show} onClick={() => setShow((s) => !s)}>
            <Icon name="eye" size={16} />
            {show ? 'Hide passwords' : 'Show passwords'}
          </Button>
          {general && <ErrorState message={general} />}
          <Button type="submit" variant="primary" size="lg" busy={busy}>
            Save and continue
          </Button>
        </form>
        <Button variant="ghost" size="sm" className="self-center" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
