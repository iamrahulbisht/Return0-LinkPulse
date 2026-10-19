import { useCallback, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Campaign } from '../../types';
import { Button, Dialog, Field } from '../ui';

interface Errors {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  form?: string;
}

/** Name + optional start/end dates (whole days in IST). Server field errors are shown under each field. */
export function NewCampaignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Campaign) => void }) {
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const closeImpl = useRef(() => {});
  closeImpl.current = () => {
    if (busy) return;
    setErrors({});
    onClose();
  };
  // Dialog re-runs its focus effect when onClose changes, so hand it a stable function.
  const close = useCallback(() => closeImpl.current(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Same checks as the server, so most mistakes are caught without a round trip.
    const local: Errors = {};
    if (!name.trim()) local.name = 'Give the campaign a name.';
    if (startsAt && endsAt && endsAt < startsAt) local.endsAt = 'The end date must be on or after the start date.';
    setErrors(local);
    if (local.name || local.endsAt) return;

    setBusy(true);
    try {
      const { campaign } = await api.campaigns.create({ name: name.trim(), startsAt: startsAt || null, endsAt: endsAt || null });
      setName('');
      setStartsAt('');
      setEndsAt('');
      setErrors({});
      onCreated(campaign);
    } catch (err) {
      if (err instanceof ApiError) {
        const f = {
          name: err.fieldMessage('name'),
          startsAt: err.fieldMessage('startsAt'),
          endsAt: err.fieldMessage('endsAt'),
        };
        setErrors({ ...f, form: f.name || f.startsAt || f.endsAt ? undefined : err.message });
      } else {
        setErrors({ form: 'Could not create the campaign. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="New campaign">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} placeholder="e.g. Freshers Welcome" autoComplete="off" />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
          <Field label="Start date" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} hint="Optional" />
          <Field label="End date" type="date" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} hint="Optional" />
        </div>
        <p className="m-0 text-[13.5px] text-text-4">Dates are whole days in IST. A campaign ends at 11:59 PM IST on its end date.</p>
        {errors.form && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
            {errors.form}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Create campaign
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
