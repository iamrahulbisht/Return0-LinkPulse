import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { BlockedDomain } from '../../types';
import { fmtDay, fmtNum } from '../../lib/format';
import { useToast } from '../../hooks/useToast';
import { Button, CardTitle, Dialog, ErrorState, Field, Select, Skeleton } from '../ui';

const REASONS = ['Spam or scam', 'Phishing or malware', 'Reported by visitors', 'Other'] as const;
type Reason = (typeof REASONS)[number];

interface Props {
  items: BlockedDomain[] | undefined;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  /** Called after a block or unblock, so the page reloads counts, flags and the audit log. */
  onChanged: () => Promise<void>;
}

export function Blocklist({ items, loading, error, onRetry, onChanged }: Props) {
  const toast = useToast();
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState<Reason>('Spam or scam');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ domain?: string; reason?: string }>({});
  const [confirm, setConfirm] = useState<BlockedDomain | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  const formErrorId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const d = domain.trim();
    const r = reason === 'Other' ? other.trim() : reason;
    const errs: { domain?: string; reason?: string } = {};
    if (!d) errs.domain = 'Enter a domain like example.com.';
    if (!r) errs.reason = 'Write a short reason.';
    setFieldErrors(errs);
    setFormError(null);
    if (errs.domain || errs.reason) return;
    setBusy(true);
    try {
      const res = await api.admin.block(d, r);
      setDomain('');
      setOther('');
      setReason('Spam or scam');
      const hit = res.domain.linksHit;
      toast(hit > 0 ? `Blocked ${res.domain.domain}. ${fmtNum(hit)} link${hit === 1 ? '' : 's'} sent for review. Unblock to undo.` : `Blocked ${res.domain.domain}. Unblock to undo.`);
      await onChanged();
    } catch (err) {
      if (err instanceof ApiError) {
        const fd = err.fieldMessage('domain');
        const fr = err.fieldMessage('reason');
        if (fd || fr) setFieldErrors({ domain: fd, reason: fr });
        else setFormError(err.message);
      } else setFormError('Could not block this domain. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Stable, because Dialog re-runs its focus effect when onClose changes.
  const unblockingRef = useRef(false);
  unblockingRef.current = unblocking;
  const closeConfirm = useCallback(() => {
    if (!unblockingRef.current) setConfirm(null);
  }, []);

  const unblock = async () => {
    if (!confirm) return;
    setUnblocking(true);
    try {
      await api.admin.unblock(confirm.id);
      toast(`Unblocked ${confirm.domain}. You can block it again at any time.`);
      setConfirm(null);
      await onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not unblock. Please try again.', 'error');
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <section
      id="blocklist"
      tabIndex={-1}
      aria-labelledby="blocklist-title"
      className="flex min-w-0 flex-[3_1_480px] scroll-mt-6 flex-col gap-4 rounded-[20px] border border-line bg-surface p-6 outline-none"
    >
      <CardTitle id="blocklist-title" className="text-[22px]">
        Domain blocklist
      </CardTitle>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-describedby={formError ? formErrorId : undefined}>
        <div className="flex flex-wrap items-start gap-2.5">
          <Field
            label="Domain to block"
            mono
            className="min-w-0 flex-[1_1_220px]"
            placeholder="bad-site.example"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            maxLength={253}
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              if (fieldErrors.domain) setFieldErrors((f) => ({ ...f, domain: undefined }));
            }}
            error={fieldErrors.domain}
          />
          <Select label="Reason" className="flex-[1_1_180px]" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </div>
        {reason === 'Other' && (
          <Field
            label="Describe the reason"
            maxLength={120}
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
              if (fieldErrors.reason) setFieldErrors((f) => ({ ...f, reason: undefined }));
            }}
            error={fieldErrors.reason}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="dark" icon="ban" busy={busy}>
            Block domain
          </Button>
          <span className="text-[13.5px] text-text-4">New links to this domain are refused. Existing links go to review.</span>
        </div>
        {formError && (
          <p id={formErrorId} role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {formError}
          </p>
        )}
      </form>

      {error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[14.5px]">
            <caption className="sr-only">Blocked domains</caption>
            <thead>
              <tr className="text-left text-[12.5px] uppercase tracking-[.06em] text-text-4">
                <th scope="col" className="px-2 py-2.5 font-semibold">Domain</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">Reason</th>
                <th scope="col" className="px-2 py-2.5 font-semibold">Added</th>
                <th scope="col" className="px-2 py-2.5 text-right font-semibold">Links hit</th>
                <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && !items
                ? [0, 1, 2].map((i) => (
                    <tr key={i} className="border-t border-line-soft">
                      <td colSpan={5} className="px-2 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : (items ?? []).map((d) => (
                    <tr key={d.id} className="border-t border-line-soft hover:bg-subtle">
                      <td className="break-all px-2 py-[13px] font-mono font-semibold">{d.domain}</td>
                      <td className="px-2 py-[13px] text-text-2">{d.reason}</td>
                      <td className="whitespace-nowrap px-2 py-[13px] text-text-4">
                        <time dateTime={d.createdAt}>{fmtDay(d.createdAt)}</time>
                      </td>
                      <td className="px-2 py-[13px] text-right font-mono">{fmtNum(d.linksHit)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Button size="sm" onClick={() => setConfirm(d)} aria-label={`Unblock ${d.domain}`}>
                          Unblock
                        </Button>
                      </td>
                    </tr>
                  ))}
              {!loading && items && items.length === 0 && (
                <tr className="border-t border-line-soft">
                  <td colSpan={5} className="px-2 py-6 text-center text-text-3">
                    No blocked domains yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={confirm !== null} onClose={closeConfirm} title={`Unblock ${confirm?.domain ?? ''}?`}>
        <p className="m-0 text-[15px] leading-[1.55] text-text-3">
          People will be able to make new links to this domain again. Links that were flagged stay in the review list. You can block it again at any time.
        </p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button onClick={closeConfirm} disabled={unblocking}>
            Keep it blocked
          </Button>
          <Button variant="dark" onClick={unblock} busy={unblocking}>
            Unblock
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
