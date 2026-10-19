import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { prepareAvatar, AVATAR_ACCEPT, ImageError } from '../lib/image';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Avatar } from '../components/Avatar';
import { HistoryList } from '../components/link-details/SidePanels';
import { Icon } from '../components/Icon';
import { Button, Card, CardTitle, ErrorState, Field, KpiCard, Loading, PageHeader } from '../components/ui';
import type { Profile as ProfileData } from '../types';

type Errors = Record<string, string | undefined>;

/** Turns an API error into per-field messages plus one general message for anything else. */
function errorsFrom(err: unknown, fields: string[]): { fieldErrors: Errors; general: string | null } {
  if (!(err instanceof ApiError)) return { fieldErrors: {}, general: 'Something went wrong. Please try again.' };
  const fieldErrors: Errors = {};
  for (const f of fields) fieldErrors[f] = err.fieldMessage(f);
  const covered = fields.some((f) => fieldErrors[f]);
  return { fieldErrors, general: covered ? null : err.message };
}

function FormNote({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'ok' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`m-0 flex items-start gap-2 rounded-input border px-3.5 py-3 text-[13.5px] font-medium ${
        tone === 'error' ? 'border-danger-line bg-danger-bg text-[#FCA5A5]' : 'border-ok-line bg-ok-bg text-ok'
      }`}
    >
      <Icon name={tone === 'error' ? 'warn' : 'check'} size={17} className="mt-px flex-none" />
      {children}
    </p>
  );
}

/** Photo, name, email, role, workspace, member since. */
function ProfileHeader({ p, onChanged }: { p: ProfileData; onChanged: (p: ProfileData) => void }) {
  const toast = useToast();
  const fileId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('upload');
    try {
      const { blob, name } = await prepareAvatar(file);
      onChanged(await api.profile.uploadAvatar(blob, name));
      toast('Profile photo updated');
    } catch (e) {
      setError(e instanceof ImageError || e instanceof ApiError ? e.message : 'Could not upload the photo. Please try again.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError(null);
    setBusy('remove');
    try {
      onChanged(await api.profile.removeAvatar());
      toast('Profile photo removed');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove the photo. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const admin = p.user.role === 'admin';
  return (
    <Card className="flex flex-wrap items-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <Avatar name={p.user.name} path={p.user.avatarPath} size={104} label={p.user.avatarPath ? `Profile photo of ${p.user.name}` : `${p.user.name}, no photo yet`} className="rounded-2xl text-[34px] shadow-[0_0_24px_rgba(212,255,0,0.08)]" />
        <div className="flex flex-wrap justify-center gap-2">
          {/* A real file input behind a label, so it works with keyboard and screen readers. */}
          <input ref={inputRef} id={fileId} type="file" accept={AVATAR_ACCEPT} className="peer sr-only" onChange={(e) => void onFile(e.target.files?.[0])} disabled={!!busy} />
          <label
            htmlFor={fileId}
            aria-disabled={!!busy}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-input border border-line-strong bg-field px-3.5 text-[14px] font-semibold text-fg transition-colors hover:bg-[#25252C] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-400 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            <Icon name="upload" size={16} />
            {busy === 'upload' ? 'Uploading…' : p.user.avatarPath ? 'Change photo' : 'Add photo'}
          </label>
          {p.user.avatarPath && (
            <Button size="sm" variant="ghost" onClick={() => void remove()} busy={busy === 'remove'} disabled={!!busy}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-w-[min(260px,100%)] flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 font-display text-[26px] font-bold tracking-tight text-fg">{p.user.name}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
              admin ? 'bg-admin text-black' : 'border border-[#2E3608] bg-accent-50 text-accent-400'
            }`}
          >
            <Icon name={admin ? 'shield' : 'check'} size={13} strokeWidth={2.4} />
            {admin ? 'Platform admin' : p.workspace.isOwner ? 'Workspace owner' : 'Member'}
          </span>
        </div>
        <span className="font-mono text-[14px] text-text-3">{p.user.email}</span>
        <dl className="m-0 mt-1 flex flex-wrap gap-x-6 gap-y-1.5 text-[13.5px]">
          <div className="flex gap-1.5">
            <dt className="text-text-4">Workspace</dt>
            <dd className="m-0 font-semibold text-text-2">{p.workspace.name}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-text-4">Member since</dt>
            <dd className="m-0 font-semibold text-text-2">{fmtDate(p.user.createdAt)}</dd>
          </div>
        </dl>
        <p className="m-0 text-[13px] text-text-4">PNG, JPEG or WebP. We crop it to a square and shrink it to 256 × 256 before uploading.</p>
        {error && <FormNote>{error}</FormNote>}
      </div>
    </Card>
  );
}

function DetailsCard({ p, onChanged }: { p: ProfileData; onChanged: (p: ProfileData) => void }) {
  const toast = useToast();
  const [name, setName] = useState(p.user.name);
  const [ws, setWs] = useState(p.workspace.name);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => {
    setName(p.user.name);
    setWs(p.workspace.name);
  }, [p.user.name, p.workspace.name]);

  const changed = name.trim() !== p.user.name || (p.workspace.isOwner && ws.trim() !== p.workspace.name);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = 'Add your name.';
    if (p.workspace.isOwner && !ws.trim()) next.workspaceName = 'Give the workspace a name.';
    setErrs(next);
    setGeneral(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      const body: { name?: string; workspaceName?: string } = {};
      if (name.trim() !== p.user.name) body.name = name.trim();
      if (p.workspace.isOwner && ws.trim() !== p.workspace.name) body.workspaceName = ws.trim();
      onChanged(await api.profile.update(body));
      toast('Profile saved');
    } catch (err) {
      const r = errorsFrom(err, ['name', 'workspaceName']);
      setErrs(r.fieldErrors);
      setGeneral(r.general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="details-title">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle id="details-title">Personal details</CardTitle>
          <span className="text-[13.5px] text-text-4">Shown in the sidebar, on link history and in the audit log.</span>
        </div>
        <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" error={errs.name} />
        <Field
          label="Workspace name"
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          maxLength={80}
          readOnly={!p.workspace.isOwner}
          aria-readonly={!p.workspace.isOwner}
          error={errs.workspaceName}
          hint={p.workspace.isOwner ? 'Everyone in the workspace sees this name.' : 'Only the workspace owner can rename it.'}
        />
        {general && <FormNote>{general}</FormNote>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy} disabled={!changed}>
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EmailCard({ p, onChanged }: { p: ProfileData; onChanged: (p: ProfileData) => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!email.trim()) next.email = 'Enter the new email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!pw) next.currentPassword = 'Enter your current password.';
    setErrs(next);
    setGeneral(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    try {
      onChanged(await api.profile.changeEmail(email.trim(), pw));
      setEmail('');
      setPw('');
      toast('Email changed. Use it next time you sign in.');
    } catch (err) {
      const r = errorsFrom(err, ['email', 'currentPassword']);
      setErrs(r.fieldErrors);
      setGeneral(r.general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="email-title">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle id="email-title">Email</CardTitle>
          <span className="text-[13.5px] text-text-4">
            You sign in with <span className="font-mono text-text-2">{p.user.email}</span>.
          </span>
        </div>
        <Field label="New email" type="email" inputMode="email" autoComplete="email" spellCheck={false} maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} error={errs.email} />
        <Field label="Current password" type="password" autoComplete="current-password" maxLength={200} value={pw} onChange={(e) => setPw(e.target.value)} error={errs.currentPassword} hint="We ask for it so nobody else can change your email." />
        {general && <FormNote>{general}</FormNote>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy}>
            Change email
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v: Errors = {};
    if (!current) v.currentPassword = 'Enter your current password.';
    if (next.length < 8) v.newPassword = 'Use at least 8 characters.';
    if (confirm !== next) v.confirm = 'The two new passwords do not match.';
    setErrs(v);
    setGeneral(null);
    setDone(false);
    if (Object.values(v).some(Boolean)) return;
    setBusy(true);
    try {
      await api.profile.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      toast('Password changed');
    } catch (err) {
      const r = errorsFrom(err, ['currentPassword', 'newPassword']);
      setErrs(r.fieldErrors);
      setGeneral(r.general);
    } finally {
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <Card as="section" aria-labelledby="password-title">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle id="password-title">Password</CardTitle>
            <span className="text-[13.5px] text-text-4">Changing it signs you out on every other device.</span>
          </div>
          <Button size="sm" variant="ghost" aria-pressed={show} onClick={() => setShow((s) => !s)}>
            <Icon name="eye" size={16} />
            {show ? 'Hide passwords' : 'Show passwords'}
          </Button>
        </div>
        <Field label="Current password" type={type} autoComplete="current-password" maxLength={200} value={current} onChange={(e) => setCurrent(e.target.value)} error={errs.currentPassword} />
        <Field label="New password" type={type} autoComplete="new-password" maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} error={errs.newPassword} hint="At least 8 characters." />
        <Field label="Repeat new password" type={type} autoComplete="new-password" maxLength={200} value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errs.confirm} />
        {general && <FormNote>{general}</FormNote>}
        {done && <FormNote tone="ok">Password changed. Other devices have been signed out; you stay signed in here.</FormNote>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const { logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState<'others' | 'me' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = async () => {
    setError(null);
    setBusy('others');
    try {
      await api.profile.signOutOtherDevices();
      toast('Signed out on all other devices');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign out other devices. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card as="section" aria-labelledby="sessions-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle id="sessions-title">Sessions and security</CardTitle>
        <span className="text-[13.5px] text-text-4">Lost a phone or used a shared computer? Sign out everywhere else.</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px] text-text-3">
        <li className="flex items-start gap-2.5">
          <Icon name="shield" size={16} className="mt-0.5 flex-none text-accent-400" />
          After 5 wrong sign-in tries, sign-in pauses for 5 minutes.
        </li>
        <li className="flex items-start gap-2.5">
          <Icon name="lock" size={16} className="mt-0.5 flex-none text-accent-400" />
          Sessions last 7 days and are kept in a secure, http-only cookie.
        </li>
      </ul>
      {error && <FormNote>{error}</FormNote>}
      <div className="mt-auto flex flex-wrap gap-2.5">
        <Button onClick={() => void others()} busy={busy === 'others'} disabled={!!busy} icon="devices">
          Sign out other devices
        </Button>
        <Button
          variant="dark"
          icon="logout"
          busy={busy === 'me'}
          disabled={!!busy}
          onClick={async () => {
            setBusy('me');
            await logout();
            nav('/login');
          }}
        >
          Sign out
        </Button>
      </div>
    </Card>
  );
}

export function Profile() {
  const { refresh } = useAuth();
  const profile = useAsync(() => api.profile.get(), []);

  // Keep the page and the sidebar (name, workspace, photo) in step after every change.
  const onChanged = (p: ProfileData) => {
    profile.setData(() => p);
    void refresh();
  };

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account, photo and sign-in settings." />
      {profile.loading && !profile.data && <Loading label="Loading your profile…" />}
      {profile.error && !profile.data && <ErrorState message={profile.error.message} onRetry={() => void profile.reload()} />}
      {profile.data && (
        <>
          <ProfileHeader p={profile.data} onChanged={onChanged} />
          {/* Stat tiles: tablet and desktop only (hidden on phones, under 640 px). 2 × 2, then 4 in a row from 768 px. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 md:grid-cols-4">
            <KpiCard label="Links" value={fmtNum(profile.data.stats.links)} note="Never deleted, even when ended" icon="links" />
            <KpiCard label="Human clicks" value={fmtNum(profile.data.stats.humanClicks)} note="All time, bots not counted" icon="trend" />
            <KpiCard label="Campaigns" value={fmtNum(profile.data.stats.campaigns)} icon="campaigns" />
            <KpiCard label="QR codes" value={fmtNum(profile.data.stats.qrCodes)} icon="qr" />
          </div>
          <AccountNotices />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-4">
            <DetailsCard p={profile.data} onChanged={onChanged} />
            <EmailCard p={profile.data} onChanged={onChanged} />
            <PasswordCard />
            <SessionsCard />
          </div>
        </>
      )}
    </>
  );
}

/**
 * What a platform admin did to my account or my links, with their reasons (docs/design/admin-management.md, F9).
 * Most people never have any, so the card only appears when there is something to say.
 */
function AccountNotices() {
  const notices = useAsync(() => api.profile.notices(), []);
  if (!notices.data?.items.length) return null;
  return (
    <HistoryList
      title="Account notices"
      empty=""
      items={notices.data.items}
      loading={notices.loading}
      error={notices.error}
      onRetry={() => void notices.reload()}
    />
  );
}
