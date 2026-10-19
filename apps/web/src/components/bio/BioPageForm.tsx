import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '../../lib/api';
import { prettyUrl } from '../../lib/format';
import type { BioPage, Link, LinkStatus } from '../../types';
import { Button, ErrorState, Field, ShortLink, StatusBadge } from '../ui';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/; // same rule as the API
const MAX_BUTTONS = 20;

interface Option {
  id: string;
  code: string;
  status: LinkStatus;
  hint: string;
}
interface Picked {
  linkId: string;
  label: string;
}
type Errors = Partial<Record<'slug' | 'title' | 'description', string>> & { labels?: Record<number, string> };

export function BioPageForm({ page, links, onSaved, onCancel }: { page: BioPage | null; links: Link[]; onSaved: (p: BioPage) => void; onCancel: () => void }) {
  const editing = page !== null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const descId = useId();
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [description, setDescription] = useState(page?.description ?? '');
  const [picked, setPicked] = useState<Picked[]>(() => page?.links.map((l) => ({ linkId: l.linkId, label: l.label })) ?? []);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Links already on the page may not be in the first 100 of the list, so add them from the page itself.
  const options = useMemo(() => {
    const m = new Map<string, Option>();
    for (const l of links) m.set(l.id, { id: l.id, code: l.code, status: l.status, hint: l.title ?? prettyUrl(l.destination) });
    for (const l of page?.links ?? []) if (!m.has(l.linkId)) m.set(l.linkId, { id: l.linkId, code: l.code, status: l.status, hint: '' });
    return m;
  }, [links, page]);
  const defaultLabel = (o: Option) => (links.find((l) => l.id === o.id)?.title ?? o.code).slice(0, 80);

  const pickedIds = new Set(picked.map((p) => p.linkId));
  // Disabled links are hidden on the public page, so they cannot be added (but stay listed if already on it).
  const unpicked = [...options.values()].filter((o) => !pickedIds.has(o.id) && o.status !== 'disabled');

  const toggle = (o: Option, on: boolean) =>
    setPicked((p) => (on ? [...p, { linkId: o.id, label: defaultLabel(o) }] : p.filter((x) => x.linkId !== o.id)));
  const move = (i: number, d: -1 | 1) =>
    setPicked((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const setLabel = (i: number, label: string) => setPicked((p) => p.map((x, k) => (k === i ? { ...x, label } : x)));

  function validate(): Errors {
    const e: Errors = {};
    if (!editing && !SLUG_RE.test(slug.trim().toLowerCase())) e.slug = 'Use 3 to 40 letters, numbers or dashes.';
    if (!title.trim()) e.title = 'Add a title.';
    const labels: Record<number, string> = {};
    picked.forEach((p, i) => {
      if (!p.label.trim()) labels[i] = 'Give this button a label.';
    });
    if (Object.keys(labels).length) e.labels = labels;
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      links: picked.map((p) => ({ linkId: p.linkId, label: p.label.trim() })),
    };
    try {
      const res = editing ? await api.bio.update(page.id, body) : await api.bio.create({ ...body, slug: slug.trim().toLowerCase() });
      onSaved(res.page);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setFormError('Could not save the page. Please try again.');
        return;
      }
      const next: Errors = {};
      for (const f of err.fields) {
        const m = /^links\.(\d+)\.label$/.exec(f.field);
        if (m) next.labels = { ...next.labels, [Number(m[1])]: f.message };
        else if (f.field === 'slug' || f.field === 'title' || f.field === 'description') next[f.field] = f.message;
      }
      if (err.code === 'SLUG_RESERVED') next.slug = err.message;
      setErrors(next);
      if (!Object.keys(next).length || err.code === 'SLUG_TAKEN') setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="bio-form-title" className="flex min-w-0 flex-col gap-5 rounded-[20px] border-2 border-accent-300 bg-surface p-6">
      <h2 id="bio-form-title" ref={headingRef} tabIndex={-1} className="m-0 font-display text-[22px] font-bold outline-none">
        {editing ? `Edit ${page.title}` : 'New bio page'}
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
          <Field
            label="Page address"
            prefix="/b/"
            mono
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="tech-club"
            maxLength={40}
            readOnly={editing}
            autoCapitalize="none"
            spellCheck={false}
            error={errors.slug}
            hint={editing ? 'The address cannot be changed after the page is made.' : 'Letters, numbers and dashes. This goes in your bio.'}
          />
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. GEHU Tech Club" maxLength={80} error={errors.title} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={descId} className="text-[14px] font-semibold">Description <span className="font-normal text-text-4">(optional)</span></label>
          <textarea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
            rows={3}
            aria-describedby={`${descId}-msg`}
            className="min-h-[88px] rounded-input border-[1.5px] border-line-strong bg-field px-3.5 py-2.5 text-[15px] text-fg outline-none focus:shadow-[0_0_0_4px_rgba(212,255,0,.16)]"
          />
          <span id={`${descId}-msg`} className={`text-[13.5px] ${errors.description ? 'font-semibold text-danger' : 'text-text-4'}`}>
            {errors.description ?? `${description.length} / 240`}
          </span>
        </div>

        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[14px] font-semibold">
            Buttons on the page <span className="font-normal text-text-4">({picked.length} of up to {MAX_BUTTONS}, top to bottom)</span>
          </legend>
          {options.size === 0 && <span className="text-[14px] text-text-4">You have no links yet. Create a link first, then add it here.</span>}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {picked.map((p, i) => {
              const o = options.get(p.linkId);
              if (!o) return null;
              const labelErr = errors.labels?.[i];
              return (
                <li key={p.linkId} className="flex flex-col gap-3 rounded-[14px] border border-accent-300 bg-accent-50/40 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <LinkCheck option={o} checked onChange={(on) => toggle(o, on)} />
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" className="!w-11 !px-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.label || o.code} up`}>
                        <span aria-hidden>↑</span>
                      </Button>
                      <Button size="sm" className="!w-11 !px-0" disabled={i === picked.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p.label || o.code} down`}>
                        <span aria-hidden>↓</span>
                      </Button>
                    </div>
                  </div>
                  <Field label={`Button ${i + 1} text`} value={p.label} maxLength={80} onChange={(e) => setLabel(i, e.target.value)} error={labelErr} />
                </li>
              );
            })}
            {unpicked.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line p-3">
                <LinkCheck option={o} checked={false} disabled={picked.length >= MAX_BUTTONS} onChange={(on) => toggle(o, on)} />
              </li>
            ))}
          </ul>
        </fieldset>

        {formError && <ErrorState message={formError} />}

        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" variant="primary" busy={busy}>
            {editing ? 'Save changes' : 'Create page'}
          </Button>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}

function LinkCheck({ option, checked, disabled, onChange }: { option: Option; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 flex-none cursor-pointer accent-accent-600"
      />
      <label htmlFor={id} className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex min-w-0 flex-col">
          <ShortLink code={option.code} className="truncate text-[14px]" />
          {option.hint && <span className="truncate text-[13px] text-text-4">{option.hint}</span>}
        </span>
        {option.status !== 'active' && <StatusBadge status={option.status} />}
      </label>
    </div>
  );
}
