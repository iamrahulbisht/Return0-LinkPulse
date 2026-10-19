import { useCallback, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { fmtDateTime, plural } from '../../lib/format';
import type { AccountAction } from '../../types';
import { Button, Dialog } from '../ui';
import { Icon } from '../Icon';
import { useCopy } from '../create-link/useCopy';
import { ReasonField, reasonProblem } from './ReasonField';

interface Copy {
  title: string;
  lines: string[];
  confirm: string;
  danger: boolean;
  hint: string;
}

function copyFor(action: AccountAction, name: string, activeLinks: number): Copy {
  const audit = 'Saved in the account history and the audit log.';
  switch (action) {
    case 'suspend':
      return {
        title: `Suspend ${name}?`,
        lines: [
          'They can’t sign in, and every session on every device ends now.',
          'When they try to sign in, they see your reason.',
          activeLinks > 0
            ? `Their ${plural(activeLinks, 'active link')} keep working. To stop one, open it and switch it in Link life.`
            : 'They have no active links.',
        ],
        confirm: 'Suspend account',
        danger: true,
        hint: `${audit} Shown to them when they try to sign in.`,
      };
    case 'reactivate':
      return {
        title: `Reactivate ${name}?`,
        lines: ['They can sign in again with their current password.'],
        confirm: 'Reactivate',
        danger: false,
        hint: audit,
      };
    case 'unlock':
      return {
        title: `Unlock ${name}?`,
        lines: ['Clears the lock after 5 wrong passwords, so they can try again now instead of waiting.'],
        confirm: 'Unlock account',
        danger: false,
        hint: audit,
      };
    case 'sign-out':
      return {
        title: `Sign ${name} out everywhere?`,
        lines: ['Every session on every device ends now. They can sign in again with their password.'],
        confirm: 'Sign out everywhere',
        danger: true,
        hint: audit,
      };
    case 'reset-password':
      return {
        title: `Reset ${name}’s password?`,
        lines: [
          'Their current password stops working, and every session ends now.',
          'You get a temporary password to give them privately. It works for 24 hours.',
          'When they sign in with it, they must choose their own password before anything else.',
        ],
        confirm: 'Reset password',
        danger: true,
        hint: `${audit} Shown to them when they set their new password.`,
      };
  }
}

/** Second step of a reset: the temporary password, shown once. */
function TemporaryPassword({ name, password, expiresAt, onDone }: { name: string; password: string; expiresAt: string; onDone: () => void }) {
  const { copy } = useCopy();
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <div className="flex flex-col gap-[18px]">
      <p className="m-0 text-[15px] leading-[1.55] text-text-3">
        Give this to {name} in person or by a private message. It works until {fmtDateTime(expiresAt)} IST, or until they set their own.
      </p>
      <div className="flex flex-wrap items-center gap-3 rounded-input border-[1.5px] border-line-strong bg-field px-4 py-3">
        <code aria-label="Temporary password" className="min-w-0 flex-1 select-all break-all font-mono text-[20px] font-bold tracking-[.08em] text-fg">
          {password}
        </code>
        <Button size="sm" icon="copy" onClick={async () => setCopied(await copy(password))}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {copied === false && <span className="text-[13.5px] font-semibold text-danger">Could not copy. Select it and copy it by hand.</span>}
      <p role="note" className="m-0 flex items-start gap-2.5 rounded-[14px] border border-warn-line bg-warn-bg p-3.5 text-[14px] text-warn">
        <Icon name="warn" className="mt-px flex-none" />
        <span>This is the only time it is shown. It is not saved anywhere you can see it again; if it is lost, reset again.</span>
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * Confirm step for an admin account action, with the required reason.
 * Mounted fresh for each action; `onClose` must be stable (the Dialog refocuses when it changes).
 */
export function AccountActionDialog({
  userId,
  name,
  action,
  activeLinks,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  action: AccountAction;
  activeLinks: number;
  onClose: () => void;
  /** Must be stable too (it closes the dialog after a reset). */
  onDone: (action: AccountAction) => void;
}) {
  const [issued, setIssued] = useState<{ password: string; expiresAt: string } | null>(null);
  const done = useCallback(() => onDone(action), [onDone, action]);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const c = copyFor(action, name, activeLinks);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = reason.trim();
    const bad = reasonProblem(text);
    if (bad) {
      setReasonError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.admin.userAction(userId, action, text);
      if (r.temporaryPassword && r.expiresAt) setIssued({ password: r.temporaryPassword, expiresAt: r.expiresAt });
      else done();
    } catch (err) {
      setBusy(false);
      const field = err instanceof ApiError ? err.fieldMessage('reason') : undefined;
      if (field) setReasonError(field);
      else setError(err instanceof ApiError ? err.message : 'Could not do that. Please try again.');
    }
  }

  return (
    // After a reset, closing the dialog in any way (Esc, backdrop, Done) finishes the action.
    <Dialog open onClose={issued ? done : onClose} title={issued ? `Temporary password for ${name}` : c.title}>
      {issued ? (
        <TemporaryPassword name={name} password={issued.password} expiresAt={issued.expiresAt} onDone={done} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.55] text-text-3">
            {c.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <ReasonField
            value={reason}
            onChange={(v) => {
              setReason(v);
              if (reasonError) setReasonError(null);
            }}
            error={reasonError}
            hint={c.hint}
          />
          {error && (
            <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant={c.danger ? 'danger' : 'primary'} busy={busy}>
              {c.confirm}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
