import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Dialog } from '../ui';
import { SHORT_HOST } from '../../lib/api';
import { ReasonField, reasonProblem } from './ReasonField';

interface Props {
  /** Link code to restore; null = closed. */
  code: string | null;
  /** Why it was disabled, shown for context. */
  disabledReason: string | null;
  busy: boolean;
  /** Problem with the reason itself (from the API), shown under the box. */
  reasonError: string | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Confirm step before re-enabling a disabled link. The reason goes into the audit log and the owner's notices. */
export function RestoreDialog({
  code,
  disabledReason,
  busy,
  reasonError,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // Dialog re-runs its focus effect when onClose changes identity, so hand it a stable callback.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  const close = useCallback(() => {
    if (!latest.current.busy) latest.current.onCancel();
  }, []);

  // Fresh form each time the dialog opens for a link.
  useEffect(() => {
    if (code) {
      setReason('');
      setLocalError(null);
    }
  }, [code]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = reasonProblem(reason);
    if (bad) {
      setLocalError(bad);
      return;
    }
    onConfirm(reason.trim());
  };

  const problem = localError ?? reasonError;

  return (
    <Dialog open={code !== null} onClose={close} title={`Restore ${SHORT_HOST}/${code ?? ''}?`}>
      <form onSubmit={submit} className="flex flex-col gap-[18px]" noValidate>
        <p className="m-0 text-[15px] leading-[1.55] text-text-3">
          It redirects again from the next visit. The cache is cleared now.
          {disabledReason && <> It was disabled for: {disabledReason}.</>}
        </p>
        <ReasonField
          value={reason}
          onChange={(v) => {
            setReason(v);
            if (localError) setLocalError(null);
          }}
          error={problem}
          hint="Saved in the audit log and shown to the owner."
          placeholder="For example: owner removed the spam page"
        />
        {error && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button size="md" onClick={onCancel} disabled={busy}>
            Keep it disabled
          </Button>
          <Button size="md" type="submit" variant="primary" busy={busy}>
            Restore link
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
