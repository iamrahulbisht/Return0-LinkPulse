import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fmtDate, initials, plural } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Icon } from '../components/Icon';
import { Button, Card, CardTitle, Dialog, EmptyState, ErrorState, Field, Loading, PageHeader, Pill } from '../components/ui';
import type { ReceivedInvite, Workspace, WorkspaceMember, WorkspaceMembers } from '../types';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

function RoleBadge({ role }: { role: 'owner' | 'member' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold ${
        role === 'owner' ? 'border-[#3A4A00] bg-[rgba(212,255,0,.08)] text-accent-400' : 'border-line-strong bg-field text-text-3'
      }`}
    >
      <Icon name={role === 'owner' ? 'shield' : 'check'} size={13} />
      {role === 'owner' ? 'Owner' : 'Member'}
    </span>
  );
}

/** Invitations sent to me: the notifications. Accepting switches to that workspace. */
function InvitationsCard({ invites, onAnswered }: { invites: ReceivedInvite[]; onAnswered: (accepted: boolean, wsId: string) => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (inv: ReceivedInvite, accept: boolean) => {
    setBusy(`${inv.id}:${accept}`);
    try {
      if (accept) await api.invites.accept(inv.id);
      else await api.invites.decline(inv.id);
      toast(accept ? `You joined ${inv.workspace.name}` : 'Invitation declined');
      await onAnswered(accept, inv.workspace.id);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card aria-labelledby="inv-title" className="border-[#3A4A00]">
      <div className="mb-4 flex items-center gap-2">
        <Icon name="bell" className="text-accent-400" />
        <CardTitle id="inv-title">Invitations for you</CardTitle>
        <Pill className="ml-1">{invites.length}</Pill>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-input border border-line-strong bg-field p-4">
            <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
              <span className="truncate text-[15.5px] font-semibold text-fg">{inv.workspace.name}</span>
              <span className="text-[13.5px] text-text-4">
                {inv.invitedBy} invited you · {plural(inv.workspace.members, 'member')} · {fmtDate(inv.createdAt)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => answer(inv, false)} busy={busy === `${inv.id}:false`} disabled={!!busy}>
                Decline
              </Button>
              <Button size="sm" variant="primary" icon="check" onClick={() => answer(inv, true)} busy={busy === `${inv.id}:true`} disabled={!!busy}>
                Accept
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateWorkspaceForm({ onCreated }: { onCreated: (ws: Workspace) => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the workspace a name.');
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await api.workspaces.create(name.trim());
      setName('');
      toast(`Created ${workspace.name}. You are now working in it.`);
      await onCreated(workspace);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-start gap-3 border-t border-line pt-4">
      <Field
        label="New workspace"
        placeholder="e.g. Robotics Club"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        error={error}
        className="min-w-[200px] flex-1"
      />
      <Button type="submit" icon="plus" busy={busy} className="sm:mt-[27px]">
        Create
      </Button>
    </form>
  );
}

function WorkspaceList({
  items,
  selected,
  onSelect,
  onSwitch,
  switching,
  footer,
}: {
  items: Workspace[];
  selected: string | null;
  onSelect: (id: string) => void;
  onSwitch: (ws: Workspace) => void;
  switching: string | null;
  footer: ReactNode;
}) {
  return (
    <Card aria-labelledby="ws-title" className="flex flex-col gap-4">
      <CardTitle id="ws-title">Your workspaces</CardTitle>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((w) => (
          <li
            key={w.id}
            className={`flex flex-wrap items-center gap-3 rounded-input border p-3 ${selected === w.id ? 'border-accent-400 bg-[#18181C]' : 'border-line-strong bg-field'}`}
          >
            <button
              type="button"
              onClick={() => onSelect(w.id)}
              aria-pressed={selected === w.id}
              className="flex min-h-[44px] min-w-0 flex-[1_1_180px] items-center gap-3 rounded-lg text-left"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#202026] text-[13px] font-bold text-accent-400">{initials(w.name)}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-semibold text-fg">{w.name}</span>
                <span className="text-[13px] text-text-4">
                  {plural(w.members, 'member')}
                  {w.role === 'member' && ` · owner ${w.ownerName}`}
                </span>
              </span>
            </button>
            <RoleBadge role={w.role} />
            {w.isActive ? (
              <span className="inline-flex h-11 items-center gap-1.5 px-2 text-[13.5px] font-semibold text-ok">
                <span aria-hidden className="h-2 w-2 rounded-full bg-ok" />
                Current
              </span>
            ) : (
              <Button size="sm" onClick={() => onSwitch(w)} busy={switching === w.id} disabled={!!switching}>
                Switch
              </Button>
            )}
          </li>
        ))}
      </ul>
      {footer}
    </Card>
  );
}

type Confirm = { kind: 'remove'; member: WorkspaceMember } | { kind: 'leave' } | null;

/** Members, open invites, invite form and rename. Owner-only controls are not shown to members (the API checks too). */
function ManagePanel({ wsId, onChanged, onLeft }: { wsId: string; onChanged: () => Promise<void>; onLeft: () => Promise<void> }) {
  const toast = useToast();
  const m = useAsync<WorkspaceMembers>(() => api.workspaces.members(wsId), [wsId]);
  const [email, setEmail] = useState('');
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (m.data) setName(m.data.workspace.name);
  }, [m.data]);

  if (m.loading && !m.data) return <Card><Loading label="Loading members…" /></Card>;
  if (m.error || !m.data) return <ErrorState message={m.error?.message ?? 'Could not load members.'} onRetry={() => m.reload()} />;
  const { workspace, members, invites } = m.data;
  const owner = workspace.isOwner;

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setInviteErr('Enter their email address.');
    setInviting(true);
    setInviteErr(null);
    try {
      await api.workspaces.invite(wsId, email.trim());
      toast(`Invite sent to ${email.trim().toLowerCase()}`);
      setEmail('');
      await m.reload(true);
    } catch (err) {
      setInviteErr(err instanceof ApiError ? (err.fieldMessage('email') ?? err.message) : errMsg(err));
    } finally {
      setInviting(false);
    }
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameErr('Give the workspace a name.');
    setRenaming(true);
    setNameErr(null);
    try {
      await api.workspaces.rename(wsId, name.trim());
      toast('Workspace renamed');
      await Promise.all([m.reload(true), onChanged()]);
    } catch (err) {
      setNameErr(errMsg(err));
    } finally {
      setRenaming(false);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      await api.workspaces.cancelInvite(wsId, inviteId);
      toast('Invite cancelled');
      await m.reload(true);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm.kind === 'remove') {
        await api.workspaces.removeMember(wsId, confirm.member.userId);
        toast(`${confirm.member.name} was removed`);
        setConfirm(null);
        await Promise.all([m.reload(true), onChanged()]);
      } else {
        await api.workspaces.leave(wsId);
        toast(`You left ${workspace.name}`);
        setConfirm(null);
        await onLeft();
      }
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card aria-labelledby="manage-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle id="manage-title">{workspace.name}</CardTitle>
          <span className="text-[13.5px] text-text-4">
            {owner ? 'You created this workspace: you manage its people.' : 'You can work on all links, campaigns and QR codes here. Only the owner manages people.'}
          </span>
        </div>
        {!owner && (
          <Button size="sm" variant="danger" icon="logout" onClick={() => setConfirm({ kind: 'leave' })}>
            Leave
          </Button>
        )}
      </div>

      {owner && (
        <form onSubmit={rename} noValidate className="flex flex-wrap items-start gap-3">
          <Field label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={nameErr} className="min-w-[200px] flex-1" />
          <Button type="submit" busy={renaming} disabled={name.trim() === workspace.name} className="sm:mt-[27px]">
            Rename
          </Button>
        </form>
      )}

      <section aria-labelledby="members-title" className="flex flex-col gap-2">
        <h3 id="members-title" className="m-0 text-[14px] font-bold uppercase tracking-wider text-text-4">
          Members ({members.length})
        </h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {members.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center gap-3 rounded-input border border-line-strong bg-field p-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#202026] text-[13px] font-bold text-accent-400">{initials(p.name)}</span>
              <span className="flex min-w-0 flex-[1_1_180px] flex-col">
                <span className="truncate text-[14.5px] font-semibold text-fg">
                  {p.name}
                  {p.isYou && <span className="font-normal text-text-4"> (you)</span>}
                </span>
                <span className="truncate text-[13px] text-text-4">
                  {p.email} · joined {fmtDate(p.joinedAt)}
                </span>
              </span>
              <RoleBadge role={p.role} />
              {owner && p.role !== 'owner' && (
                <Button size="sm" onClick={() => setConfirm({ kind: 'remove', member: p })} aria-label={`Remove ${p.name}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {owner && (
        <section aria-labelledby="invite-title" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 id="invite-title" className="m-0 text-[14px] font-bold uppercase tracking-wider text-text-4">
            Invite people
          </h3>
          <form onSubmit={invite} noValidate className="flex flex-wrap items-start gap-3">
            <Field
              label="Email address"
              type="email"
              autoComplete="off"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              error={inviteErr}
              hint="They see the invite in LinkPulse after signing in (or after signing up with this email)."
              className="min-w-[220px] flex-1"
            />
            <Button type="submit" variant="primary" icon="plus" busy={inviting} className="sm:mt-[27px]">
              Send invite
            </Button>
          </form>
          {invites.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Waiting for an answer">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-input border border-dashed border-line-strong p-3">
                  <Icon name="clock" className="text-warn" />
                  <span className="flex min-w-0 flex-[1_1_180px] flex-col">
                    <span className="truncate text-[14.5px] font-semibold text-fg">{i.email}</span>
                    <span className="text-[13px] text-text-4">Waiting for an answer · sent {fmtDate(i.createdAt)}</span>
                  </span>
                  <Button size="sm" onClick={() => cancelInvite(i.id)} aria-label={`Cancel invite for ${i.email}`}>
                    Cancel invite
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={!!confirm} onClose={() => !working && setConfirm(null)} title={confirm?.kind === 'remove' ? `Remove ${confirm.member.name}?` : `Leave ${workspace.name}?`}>
        <p className="m-0 text-[14.5px] text-text-3">
          {confirm?.kind === 'remove'
            ? 'They lose access to this workspace at once. Links they made stay here.'
            : 'You lose access to its links, campaigns and analytics. The owner can invite you again.'}
        </p>
        <div className="flex justify-end gap-3">
          <Button onClick={() => setConfirm(null)} disabled={working}>
            Keep
          </Button>
          <Button variant="danger" onClick={runConfirm} busy={working}>
            {confirm?.kind === 'remove' ? 'Remove' : 'Leave'}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

export function Workspaces() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const ws = useAsync(() => api.workspaces.list(), []);
  const inv = useAsync(() => api.invites.list(), []);
  const [switching, setSwitching] = useState<string | null>(null);
  const selected = params.get('ws') ?? me?.workspace.id ?? null;
  const select = (id: string) => setParams({ ws: id }, { replace: true });

  /** After anything that changes membership: reload lists and the sidebar (active workspace, badge). */
  const reloadAll = async () => {
    await Promise.all([ws.reload(true), inv.reload(true), refresh()]);
  };

  const switchTo = async (w: Workspace) => {
    setSwitching(w.id);
    try {
      await api.workspaces.switchTo(w.id);
      toast(`Now working in ${w.name}`);
      await reloadAll();
      select(w.id);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setSwitching(null);
    }
  };

  const items = ws.data?.items ?? [];
  const known = items.some((w) => w.id === selected);

  return (
    <>
      <PageHeader title="Workspaces" subtitle="Create workspaces, invite people and switch between them. Everyone in a workspace works on the same links." />
      {inv.data && inv.data.items.length > 0 && (
        <InvitationsCard
          invites={inv.data.items}
          onAnswered={async (accepted, wsId) => {
            await reloadAll();
            if (accepted) select(wsId);
          }}
        />
      )}
      {inv.error && <ErrorState message={inv.error.message} onRetry={() => inv.reload()} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {ws.loading && !ws.data ? (
          <Card><Loading label="Loading workspaces…" /></Card>
        ) : ws.error ? (
          <ErrorState message={ws.error.message} onRetry={() => ws.reload()} />
        ) : (
          <WorkspaceList
            items={items}
            selected={selected}
            onSelect={select}
            onSwitch={switchTo}
            switching={switching}
            footer={
              <CreateWorkspaceForm
                onCreated={async (w) => {
                  await reloadAll();
                  select(w.id);
                }}
              />
            }
          />
        )}
        {selected && known ? (
          <ManagePanel
            key={selected}
            wsId={selected}
            onChanged={reloadAll}
            onLeft={async () => {
              setParams({}, { replace: true });
              await reloadAll();
            }}
          />
        ) : (
          ws.data && <Card><EmptyState icon="list" title="Pick a workspace" body="Choose one on the left to see its members." /></Card>
        )}
      </div>
    </>
  );
}
