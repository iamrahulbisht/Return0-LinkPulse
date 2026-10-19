import { useState } from 'react';
import type { Link, LinkStatus } from '../../types';
import { api, ApiError } from '../../lib/api';
import { fmtDateTime, fmtNum, prettyUrl } from '../../lib/format';
import { Button, Dialog, ErrorState } from '../ui';
import { lifeLook } from './LifeStrip';
import { ReasonField, reasonProblem } from '../admin/ReasonField';

type Settable = 'active' | 'limit_reached' | 'expired';

interface Copy {
  title: string;
  lines: string[];
  /** Missing = nothing to confirm (Disabled is admin-only), just an OK button. */
  confirm?: { label: string; variant: 'primary' | 'danger' };
}

/** What switching to `target` will do, from the same fields the API changes (POST /links/:id/state). */
function copyFor(link: Link, target: LinkStatus): Copy {
  if (link.status === 'disabled') {
    return {
      title: 'This link is turned off',
      lines: [
        `An admin turned this link off${link.disabledReason ? ` (${link.disabledReason})` : ''}. Only an admin can turn it back on.`,
        'Clicks and history are kept.',
      ],
    };
  }
  const now = Date.now();
  const pastExpiry = link.expiresAt !== null && new Date(link.expiresAt).getTime() < now;
  const limitHit = link.clickLimit !== null && link.clickCount >= link.clickLimit;
  switch (target) {
    case 'disabled':
      return {
        title: 'Only an admin can turn a link off',
        lines: [
          'Turning a link off is a takedown for spam or abuse, done by a platform admin with a reason.',
          'To stop your own link, choose Expired or Limit reached.',
        ],
      };
    case 'expired':
      return {
        title: 'Expire this link now?',
        lines: [
          `${link.fallbackUrl ? `Visitors will be sent to your fallback URL (${prettyUrl(link.fallbackUrl)})` : 'Visitors will see an “Expired” page'} from now on.`,
          link.expiresAt ? `The expiry date moves from ${fmtDateTime(link.expiresAt)} IST to now.` : 'The expiry date is set to now.',
          'Clicks and history are kept, and you can make it active again.',
        ],
        confirm: { label: 'Expire now', variant: 'danger' },
      };
    case 'limit_reached':
      return {
        title: 'Stop it at the click limit now?',
        lines: [
          `The click limit becomes ${fmtNum(link.clickCount)}, the human clicks so far, so the next visitor sees “All spots are taken”.`,
          ...(pastExpiry ? ['The past expiry date is removed, so the link shows Limit reached instead of Expired.'] : []),
          'You can raise or remove the limit later.',
        ],
        confirm: { label: `Set limit to ${fmtNum(link.clickCount)}`, variant: 'danger' },
      };
    case 'active':
      return {
        title: 'Make this link active again?',
        lines: [
          ...(pastExpiry && link.expiresAt ? [`The expiry date (${fmtDateTime(link.expiresAt)} IST) is removed.`] : []),
          ...(limitHit && link.clickLimit !== null ? [`The click limit of ${fmtNum(link.clickLimit)} is removed.`] : []),
          'Visitors are sent on again right away. You can set a new expiry or limit in Edit.',
        ],
        confirm: { label: 'Make active', variant: 'primary' },
      };
  }
}

/**
 * Confirm step for "Link life": switching the real link to another state changes what visitors get,
 * so nothing happens until the owner confirms. `onClose` must be stable (the Dialog refocuses when it changes).
 */
export function ChangeStateDialog({
  link,
  target,
  adminView = false,
  onClose,
  onChanged,
}: {
  link: Link;
  target: LinkStatus;
  /** A platform admin changing someone else's link: a reason is required and shown to the owner. */
  adminView?: boolean;
  onClose: () => void;
  onChanged: (l: Link) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const c = copyFor(link, target);
  const needsReason = adminView && !!c.confirm;

  async function confirm() {
    if (needsReason) {
      const bad = reasonProblem(reason);
      if (bad) {
        setReasonError(bad);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const { link: updated } = await api.links.setState(link.id, target as Settable, needsReason ? reason.trim() : undefined);
      onChanged(updated);
    } catch (e) {
      setBusy(false);
      const field = e instanceof ApiError ? e.fieldMessage('reason') : undefined;
      if (field) setReasonError(field);
      else setError(e instanceof ApiError ? e.message : 'Could not change the link. Please try again.');
    }
  }

  return (
    <Dialog open onClose={onClose} title={c.title}>
      <div className="flex flex-col gap-[18px]">
        <div className="flex items-center gap-2 text-[14.5px] font-bold" style={{ color: lifeLook(target).fg }}>
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: lifeLook(target).fg }} />
          {lifeLook(target).label}
        </div>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.55] text-text-3">
          {c.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {needsReason && (
          <ReasonField
            label="Reason (shown to the owner)"
            value={reason}
            onChange={(v) => {
              setReason(v);
              if (reasonError) setReasonError(null);
            }}
            error={reasonError}
            hint="Saved in the link history and the audit log."
          />
        )}
        {error && <ErrorState message={error} />}
        <div className="flex flex-wrap justify-end gap-3">
          {c.confirm ? (
            <>
              <Button onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant={c.confirm.variant} busy={busy} onClick={() => void confirm()}>
                {c.confirm.label}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onClose}>
              OK
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
