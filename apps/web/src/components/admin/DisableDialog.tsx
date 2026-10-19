import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, Dialog } from '../ui';
import { SHORT_HOST } from '../../lib/api';

const REASONS = ['Spam or scam', 'Phishing or malware', 'Reported by visitors', 'Other'] as const;
type Reason = (typeof REASONS)[number];

interface Props {
  /** Link code to disable; null = closed. */
  code: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Confirm step before an admin takedown. The reason goes into the audit log. */
export function DisableDialog({ code, busy, error, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState<Reason>('Spam or scam');
  const [other, setOther] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);
  const name = useId();
  const otherId = useId();
  // Dialog re-runs its focus effect when onClose changes identity, so hand it a stable callback.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  const close = useCallback(() => {
    if (!latest.current.busy) latest.current.onCancel();
  }, []);

  // Fresh form each time the dialog opens for a link.
  useEffect(() => {
    if (code) {
      setReason('Spam or scam');
      setOther('');
      setOtherError(null);
    }
  }, [code]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason === 'Other') {
      const text = other.trim();
      if (!text) {
        setOtherError('Write a short reason.');
        return;
      }
      onConfirm(text);
      return;
    }
    onConfirm(reason);
  };

  return (
    <Dialog open={code !== null} onClose={close} title={`Disable ${SHORT_HOST}/${code ?? ''}?`}>
      <form onSubmit={submit} className="flex flex-col gap-[18px]" noValidate>
        <p className="m-0 text-[15px] leading-[1.55] text-text-3">
          The next visitor will see “Link disabled”. The cache is cleared now. Clicks and history are kept, and you can restore it later.
        </p>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-2 p-0 text-[14px] font-semibold">Reason (saved in the audit log)</legend>
          {REASONS.map((r) => (
            <label key={r} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-input px-2 text-[15px] hover:bg-subtle">
              <input
                type="radio"
                name={name}
                value={r}
                checked={reason === r}
                onChange={() => {
                  setReason(r);
                  setOtherError(null);
                }}
                className="h-5 w-5 accent-[#D4FF00]"
              />
              {r}
            </label>
          ))}
          {reason === 'Other' && (
            <div className="mt-1 flex flex-col gap-1.5 pl-2">
              <label htmlFor={otherId} className="text-[14px] font-semibold">
                Describe the reason
              </label>
              <input
                id={otherId}
                type="text"
                required
                maxLength={200}
                value={other}
                onChange={(e) => {
                  setOther(e.target.value);
                  if (otherError) setOtherError(null);
                }}
                aria-invalid={otherError ? true : undefined}
                aria-describedby={otherError ? `${otherId}-msg` : undefined}
                className={`h-[46px] rounded-input bg-field px-3.5 text-[15px] text-fg outline-none focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)] ${
                  otherError ? 'border-2 border-[#DC2626]' : 'border-[1.5px] border-line-strong'
                }`}
              />
              {otherError && (
                <span id={`${otherId}-msg`} className="text-[13.5px] font-semibold text-danger">
                  {otherError}
                </span>
              )}
            </div>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button size="md" onClick={onCancel} disabled={busy}>
            Keep it running
          </Button>
          <Button size="md" type="submit" variant="danger" busy={busy}>
            Disable now
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
