import { useState, type FormEvent } from 'react';
import type { CreateLinkBody, Link } from '../../types';
import { api, ApiError } from '../../lib/api';
import { fmtNum, istDateKey } from '../../lib/format';
import { Button, Dialog, ErrorState, Field, Switch } from '../ui';
import { DeviceRulesEditor, type RuleDraft } from '../create-link/DeviceRulesEditor';
import { ReasonField, reasonProblem } from '../admin/ReasonField';

type Errors = Partial<Record<'expiresAt' | 'fallbackUrl' | 'clickLimit' | 'password' | 'reason', string>>;

const RULE_FIELD = /^rules\.\d+\.(destination|device)$/;

function errorKey(field: string): keyof Errors | null {
  if (field === 'expiresAt' || field === 'expiresOn') return 'expiresAt';
  if (field === 'fallbackUrl' || field === 'clickLimit' || field === 'password' || field === 'reason') return field;
  return null;
}

/** Device + trimmed URL in order: the part of the rules that changes where a visit goes. */
const ruleKey = (rules: { device: string; destination: string }[]) => JSON.stringify(rules.map((r) => [r.device, r.destination.trim()]));

/**
 * Extend expiry, raise/remove the limit, set/remove the password, fallback URL, device rules.
 * Mounted fresh each time it opens, so the form always starts from the saved link.
 * Disabling is admin-only, so it is not offered here.
 */
export function EditLinkDialog({
  link,
  adminView = false,
  onClose,
  onSaved,
}: {
  link: Link;
  /** A platform admin editing someone else's link: a reason is required and shown to the owner. */
  adminView?: boolean;
  onClose: () => void;
  onSaved: (l: Link) => void;
}) {
  const initialExpiry = link.expiresAt ? istDateKey(link.expiresAt) : '';
  const [expiresOn, setExpiresOn] = useState(initialExpiry);
  const [fallbackUrl, setFallbackUrl] = useState(link.fallbackUrl ?? '');
  const [limit, setLimit] = useState(link.clickLimit != null ? String(link.clickLimit) : '');
  const [pwOn, setPwOn] = useState(link.hasPassword);
  const [password, setPassword] = useState('');
  // link.rules is already in priority order (first match wins).
  const [rules, setRules] = useState<RuleDraft[]>(() => link.rules.map((r, i) => ({ key: i + 1, device: r.device, destination: r.destination })));
  const [ruleErrors, setRuleErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: Partial<CreateLinkBody> = {};
    const errs: Errors = {};

    // Only send what changed, so the history shows exactly what the owner did.
    if (expiresOn !== initialExpiry) {
      if (expiresOn && expiresOn < istDateKey()) errs.expiresAt = 'The expiry date is in the past. Pick a later date.';
      body.expiresOn = expiresOn || null;
    }
    const fb = fallbackUrl.trim();
    if (fb !== (link.fallbackUrl ?? '')) body.fallbackUrl = fb || null;
    const lt = limit.trim();
    if (lt) {
      const n = Number(lt);
      // Only check a changed limit: "Limit reached" in Link life can save 0 on a link with no clicks yet.
      if (n !== link.clickLimit) {
        if (!Number.isInteger(n) || n < 1) errs.clickLimit = 'The click limit must be a whole number, 1 or more.';
        else body.clickLimit = n;
      }
    } else if (link.clickLimit != null) body.clickLimit = null;
    if (pwOn) {
      if (password) {
        if (password.length < 4) errs.password = 'Use at least 4 characters for the password.';
        else body.password = password;
      } else if (!link.hasPassword) errs.password = 'Type a password of at least 4 characters.';
    } else if (link.hasPassword) body.password = null;
    const rErrs: Record<string, string> = {};
    if (ruleKey(rules) !== ruleKey(link.rules)) {
      rules.forEach((r, i) => {
        if (!r.destination.trim()) rErrs[`rules.${i}.destination`] = 'Add a URL for this device, or remove the rule.';
      });
      body.rules = rules.map((r) => ({ device: r.device, destination: r.destination.trim() }));
    }

    // Only asked for when something actually changes (saving nothing just closes).
    if (adminView && Object.keys(body).length) {
      const bad = reasonProblem(reason);
      if (bad) errs.reason = bad;
    }

    setFormError(null);
    setErrors(errs);
    setRuleErrors(rErrs);
    if (Object.keys(errs).length || Object.keys(rErrs).length) return;
    if (!Object.keys(body).length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const { link: updated } = await api.links.update(link.id, adminView ? { ...body, reason: reason.trim() } : body);
      setBusy(false);
      onSaved(updated);
      onClose();
    } catch (err) {
      setBusy(false);
      if (!(err instanceof ApiError)) {
        setFormError('Could not save. Please try again.');
        return;
      }
      const mapped: Errors = {};
      const mappedRules: Record<string, string> = {};
      let unplaced = !err.fields.length;
      for (const f of err.fields) {
        const k = errorKey(f.field);
        if (k && !mapped[k]) mapped[k] = f.message;
        else if (RULE_FIELD.test(f.field)) mappedRules[f.field] ??= f.message;
        else if (!k) unplaced = true;
      }
      setErrors(mapped);
      setRuleErrors(mappedRules);
      if (unplaced) setFormError(err.message);
    }
  }

  const used = link.clickCount;
  const lowLimit = (() => {
    const n = Number(limit.trim());
    return limit.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= used;
  })();

  return (
    <Dialog open onClose={onClose} title="Edit link">
      <form onSubmit={save} noValidate className="flex flex-col gap-[18px]">
        <div className="-mx-1 flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-1">
          <Field
            label="Expiry date"
            type="date"
            min={istDateKey()}
            value={expiresOn}
            onChange={(e) => {
              setExpiresOn(e.target.value);
              setErrors((x) => ({ ...x, expiresAt: undefined }));
            }}
            error={errors.expiresAt}
            hint="Stops at 11:59 PM IST that day. Clear it for no expiry."
          />
          <Field
            label="Fallback URL (optional)"
            type="url"
            inputMode="url"
            placeholder="https://"
            mono
            value={fallbackUrl}
            onChange={(e) => {
              setFallbackUrl(e.target.value);
              setErrors((x) => ({ ...x, fallbackUrl: undefined }));
            }}
            error={errors.fallbackUrl}
            hint="Where visitors go after it expires. Leave empty to show an “Expired” page."
          />
          <Field
            label="Click limit"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="No limit"
            mono
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setErrors((x) => ({ ...x, clickLimit: undefined }));
            }}
            error={errors.clickLimit}
            hint={
              lowLimit
                ? `It already has ${fmtNum(used)} human clicks, so this limit stops it right away.`
                : `Only human clicks count. ${fmtNum(used)} used so far. Leave empty for no limit.`
            }
          />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold">Password</span>
                <span className="text-[13.5px] text-text-4">{link.hasPassword ? 'This link has a password now.' : 'Visitors type it before they are sent on.'}</span>
              </div>
              <Switch
                checked={pwOn}
                onChange={(on) => {
                  setPwOn(on);
                  setErrors((x) => ({ ...x, password: undefined }));
                }}
                label="Password"
              />
            </div>
            {pwOn && (
              <Field
                label={link.hasPassword ? 'New password' : 'Password'}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((x) => ({ ...x, password: undefined }));
                }}
                error={errors.password}
                hint={link.hasPassword ? 'Leave empty to keep the current password.' : 'At least 4 characters.'}
              />
            )}
            {!pwOn && link.hasPassword && <span className="text-[13.5px] font-semibold text-warn">Saving removes the password. Anyone with the link can open it.</span>}
          </div>
          <DeviceRulesEditor
            rules={rules}
            onChange={(next) => {
              setRules(next);
              // Row indexes shift when a rule is removed, so old messages would land on the wrong row.
              setRuleErrors({});
            }}
            errors={ruleErrors}
          />
        </div>
        {adminView && (
          <ReasonField
            label="Reason (shown to the owner)"
            value={reason}
            onChange={(v) => {
              setReason(v);
              setErrors((x) => ({ ...x, reason: undefined }));
            }}
            error={errors.reason}
            hint="Saved in the link history and the audit log."
          />
        )}
        {formError && <ErrorState message={formError} />}
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
