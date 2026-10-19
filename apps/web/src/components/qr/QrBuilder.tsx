import { useEffect, useId, useState, type FormEvent } from 'react';
import { ApiError, SHORT_HOST, api } from '../../lib/api';
import { useToast } from '../../hooks/useToast';
import type { Link, QrCode } from '../../types';
import { Icon } from '../Icon';
import { Button, ButtonLink, Field, Spinner } from '../ui';
import { startDownload } from './download';

const INKS = [
  { name: 'Ink black', hex: '#0B0B0F' },
  { name: 'Deep violet', hex: '#5B3FD6' },
  { name: 'Forest green', hex: '#166534' },
  { name: 'Light lavender', hex: '#C4B8FF' },
] as const;

type Contrast = { ratio: number; ok: boolean };

/** "New QR for a location" side panel. */
export function QrBuilder({ links, onCreated }: { links: Link[]; onCreated: (qr: QrCode) => void }) {
  const toast = useToast();
  const selectId = useId();
  const [linkId, setLinkId] = useState(links[0]?.id ?? '');
  const [location, setLocation] = useState('');
  const [ink, setInk] = useState<string>(INKS[0].hex);
  const [contrast, setContrast] = useState<Contrast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'png' | 'svg' | null>(null);
  const [created, setCreated] = useState<QrCode | null>(null);

  // Keep the selection valid when the link list arrives or changes.
  useEffect(() => {
    if (!links.some((l) => l.id === linkId)) setLinkId(links[0]?.id ?? '');
  }, [links, linkId]);

  // The contrast rule lives on the server (same check it uses on create), so ask it instead of duplicating the maths.
  useEffect(() => {
    let stale = false;
    setContrast(null);
    api.qr
      .contrast(ink)
      .then((c) => !stale && setContrast(c))
      .catch(() => !stale && setContrast(null));
    return () => {
      stale = true;
    };
  }, [ink]);

  async function create(format: 'png' | 'svg', e?: FormEvent) {
    e?.preventDefault();
    const label = location.trim();
    if (!label) {
      setError('Say where it will be printed.');
      return;
    }
    if (!linkId) return;
    setError(null);
    setBusy(format);
    try {
      const { qr, contrast: c } = await api.links.createQr(linkId, label, ink);
      startDownload(format === 'png' ? api.qr.pngUrl(qr.id, true) : api.qr.svgUrl(qr.id, true));
      setCreated(qr);
      setLocation('');
      onCreated(qr);
      toast(c.ok ? `QR for "${qr.locationLabel}" created. Download started.` : `QR for "${qr.locationLabel}" created. It is light, so test it with a phone before printing.`, c.ok ? 'ok' : 'info');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const fieldMsg = apiErr?.fieldMessage('location_label');
      if (fieldMsg) setError(fieldMsg);
      else toast(apiErr?.message ?? 'Could not create the QR code. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const current = INKS.find((i) => i.hex === ink) ?? INKS[0];

  return (
    <aside aria-labelledby="qr-new-title" className="flex min-w-0 flex-[2_1_340px] flex-col gap-[18px] rounded-[20px] border border-line bg-surface p-6">
      <h2 id="qr-new-title" className="m-0 font-display text-[22px] font-bold">New QR for a location</h2>

      {links.length === 0 ? (
        <div className="flex flex-col items-start gap-3 text-[14.5px] text-text-3">
          <span>You need an active link before you can make a QR code for it.</span>
          <ButtonLink to="/links/new" variant="secondary" icon="plus">Create a link</ButtonLink>
        </div>
      ) : (
        <form className="flex flex-col gap-[18px]" onSubmit={(e) => void create('png', e)} noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor={selectId} className="text-[14px] font-semibold">Link</label>
            <select
              id={selectId}
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className="h-12 cursor-pointer rounded-input border border-line-strong bg-field px-3 font-mono text-[15px] text-fg outline-none focus:border-accent-400"
            >
              {links.map((l) => (
                <option key={l.id} value={l.id}>
                  {SHORT_HOST}/{l.code}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Where will it be printed?"
            placeholder="e.g. Hostel notice board"
            value={location}
            maxLength={60}
            onChange={(e) => {
              setLocation(e.target.value);
              if (error) setError(null);
            }}
            hint="Scans from this code are tagged with this name."
            error={error}
          />

          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[14px] font-semibold">Colour</legend>
            <div className="flex flex-wrap gap-2.5">
              {INKS.map((c) => {
                const on = c.hex === ink;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    aria-pressed={on}
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => setInk(c.hex)}
                    className={`h-11 w-11 cursor-pointer rounded-input border-[3px] shadow-[inset_0_0_0_2px_#FFFFFF] ${on ? 'border-accent-400' : 'border-line'}`}
                    style={{ background: c.hex }}
                  />
                );
              })}
            </div>
            <span aria-live="polite" className={`flex min-h-[20px] items-center gap-2 text-[13.5px] font-semibold ${contrast ? (contrast.ok ? 'text-ok' : 'text-danger') : 'text-text-4'}`}>
              {contrast ? (
                <>
                  <Icon name={contrast.ok ? 'check' : 'warn'} size={16} />
                  {contrast.ok ? 'Good contrast. Scans well from a distance.' : 'Too light on white. Phones may fail to scan it.'}
                  <span className="font-normal">({current.name}, {contrast.ratio} : 1)</span>
                </>
              ) : (
                <>
                  <Spinner className="!h-3 !w-3" />
                  Checking contrast…
                </>
              )}
            </span>
          </fieldset>

          {/* No fake preview: until a code exists we show the chosen colour; after creating, the real image from the API. */}
          <div className="flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong bg-subtle p-[18px] text-center">
            {created ? (
              <>
                <img src={api.qr.pngUrl(created.id)} alt={`QR code for ${SHORT_HOST}/${created.code} at ${created.locationLabel}`} width={168} height={168} className="h-[168px] w-[168px] rounded-[10px] bg-[#FFFFFF]" />
                <span className="text-[13px] text-text-3">Just made: {created.locationLabel}</span>
              </>
            ) : (
              <>
                <span className="flex h-[120px] w-[120px] items-center justify-center rounded-[10px] bg-[#FFFFFF]" style={{ color: ink }}>
                  <Icon name="qr" size={84} strokeWidth={1.6} />
                </span>
                <span className="text-[13px] text-text-4">Your code appears here after you create it.</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" variant="primary" className="h-[50px] flex-1 whitespace-nowrap" busy={busy === 'png'} disabled={busy !== null}>
              Create and download PNG
            </Button>
            <Button className="h-[50px]" busy={busy === 'svg'} disabled={busy !== null} onClick={() => void create('svg')} aria-label="Create and download SVG">
              SVG
            </Button>
          </div>
        </form>
      )}
    </aside>
  );
}
