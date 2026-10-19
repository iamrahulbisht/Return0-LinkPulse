import type {
  AdminOverview, AlertItem, Profile, AuditItem, BioPage, BlockedDomain, Campaign, CreateLinkBody, Flag, HistoryItem, ImportPreview,
  ImportRow, Link, LinkDetail, LinkList, LinkStatus, Me, Overview, Period, PublicBio, QrCode, Share, Tag, Timeseries,
  TopLink, User, ValidateResult, Visit, ApiErrorField, Workspace, WorkspaceMembers, SentInvite, ReceivedInvite,
  AccountAction, AccountFilter, AccountStatus, AdminUserDetail, AdminUserLinks, AdminUserList,
} from '../types';

// `||`, not `??`: a variable added in the Vercel dashboard with an empty value builds as "" and would
// send API calls to the static site (POST → 405) instead of /api.
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
/** Public base of short links (the API domain). Shown wherever a short link is shown. */
export const SHORT_BASE = (import.meta.env.VITE_SHORT_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
export const SHORT_HOST = SHORT_BASE.replace(/^https?:\/\//, '');

/** Error from the API: `{ error: { code, message, fields? } }`. `message` is plain English, safe to show. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: ApiErrorField[] = [],
  ) {
    super(message);
  }
  fieldMessage(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs(query)}`, {
      method,
      credentials: 'include',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach LinkPulse. Check your connection and try again.');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; fields?: ApiErrorField[] } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Something went wrong (${res.status}).`, e?.fields ?? []);
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

const get = <T>(p: string, q?: Query) => request<T>('GET', p, undefined, q);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

interface AnalyticsQuery extends Query {
  period?: Period;
  campaign?: string;
  linkId?: string;
  limit?: number;
}

export const api = {
  auth: {
    me: () => get<Me>('/auth/me'),
    login: (email: string, password: string) => post<{ user: User }>('/auth/login', { email, password }),
    signup: (name: string, email: string, password: string) => post<{ user: User }>('/auth/signup', { name, email, password }),
    logout: () => post<{ ok: true }>('/auth/logout'),
  },
  profile: {
    get: () => get<Profile>('/me/profile'),
    update: (body: { name?: string; workspaceName?: string }) => patch<Profile>('/me/profile', body),
    changeEmail: (email: string, currentPassword: string) => post<Profile>('/me/email', { email, currentPassword }),
    changePassword: (currentPassword: string, newPassword: string) => post<{ ok: true }>('/me/password', { currentPassword, newPassword }),
    signOutOtherDevices: () => post<{ ok: true }>('/me/sessions/revoke'),
    uploadAvatar: (file: Blob, name: string) => {
      const fd = new FormData();
      fd.append('file', file, name);
      return request<Profile>('PUT', '/me/avatar', fd);
    },
    removeAvatar: () => del<Profile>('/me/avatar'),
    /** What a platform admin did to my account or my links, with their reasons. */
    notices: () => get<{ items: HistoryItem[] }>('/me/notices'),
    /** Same-origin photo URL (the session cookie is sent). */
    avatarUrl: (path: string) => `${BASE}${path}`,
  },
  workspaces: {
    list: () => get<{ items: Workspace[] }>('/workspaces'),
    create: (name: string) => post<{ workspace: Workspace }>('/workspaces', { name }),
    switchTo: (id: string) => post<{ workspace: Workspace }>(`/workspaces/${id}/switch`),
    rename: (id: string, name: string) => patch<{ workspace: Workspace }>(`/workspaces/${id}`, { name }),
    members: (id: string) => get<WorkspaceMembers>(`/workspaces/${id}/members`),
    invite: (id: string, email: string) => post<{ invite: SentInvite }>(`/workspaces/${id}/invites`, { email }),
    cancelInvite: (id: string, inviteId: string) => del<{ ok: true }>(`/workspaces/${id}/invites/${inviteId}`),
    removeMember: (id: string, userId: string) => del<{ ok: true }>(`/workspaces/${id}/members/${userId}`),
    leave: (id: string) => post<{ ok: true }>(`/workspaces/${id}/leave`),
  },
  /** Invitations sent to me. */
  invites: {
    list: () => get<{ items: ReceivedInvite[] }>('/invites'),
    accept: (id: string) => post<{ workspace: Workspace }>(`/invites/${id}/accept`),
    decline: (id: string) => post<{ ok: true }>(`/invites/${id}/decline`),
  },
  links: {
    list: (q: { status?: 'all' | LinkStatus; campaign?: string; tag?: string; q?: string; page?: number; pageSize?: number; all?: boolean }) =>
      get<LinkList>('/links', q),
    validate: (destination: string, alias: string) => post<ValidateResult>('/links/validate', { destination, alias }),
    create: (body: CreateLinkBody) => post<{ link: Link }>('/links', body),
    get: (id: string) => get<LinkDetail>(`/links/${id}`),
    /** `reason` is required when an admin changes a link outside their workspaces (LinkDetail.adminView). */
    update: (id: string, body: Partial<CreateLinkBody> & { reason?: string }) => patch<{ link: Link }>(`/links/${id}`, body),
    setState: (id: string, state: 'active' | 'limit_reached' | 'expired', reason?: string) =>
      post<{ link: Link }>(`/links/${id}/state`, { state, reason }),
    clicks: (id: string, limit = 20) => get<{ items: Visit[] }>(`/links/${id}/clicks`, { limit }),
    history: (id: string) => get<{ items: HistoryItem[] }>(`/links/${id}/history`),
    qr: (id: string) => get<{ items: QrCode[] }>(`/links/${id}/qr`),
    createQr: (id: string, location_label: string, fg_color: string) =>
      post<{ qr: QrCode; contrast: { ratio: number; ok: boolean } }>(`/links/${id}/qr`, { location_label, fg_color }),
  },
  campaigns: {
    list: () => get<{ items: Campaign[] }>('/campaigns'),
    get: (id: string) => get<{ campaign: Campaign }>(`/campaigns/${id}`),
    create: (body: { name: string; startsAt?: string | null; endsAt?: string | null }) => post<{ campaign: Campaign }>('/campaigns', body),
    update: (id: string, body: { name?: string; startsAt?: string | null; endsAt?: string | null }) => patch<{ campaign: Campaign }>(`/campaigns/${id}`, body),
  },
  tags: {
    list: () => get<{ items: Tag[] }>('/tags'),
    create: (name: string) => post<{ tag: Tag }>('/tags', { name }),
  },
  qr: {
    list: () => get<{ items: QrCode[] }>('/qr'),
    contrast: (fg: string) => get<{ ratio: number; ok: boolean }>('/qr/contrast', { fg }),
    /** Same-origin image URLs (the session cookie is sent). */
    pngUrl: (id: string, download = false) => `${BASE}/qr/${id}.png${download ? '?download=1' : ''}`,
    svgUrl: (id: string, download = false) => `${BASE}/qr/${id}.svg${download ? '?download=1' : ''}`,
  },
  import: {
    preview: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<ImportPreview>('POST', '/import/preview', fd);
    },
    previewText: (text: string) => post<ImportPreview>('/import/preview-text', { text }),
    commit: (rows: Pick<ImportRow, 'row' | 'alias' | 'destination' | 'tags'>[], campaignId: string | null) =>
      post<{ imported: number; skipped: number; rows: ImportRow[] }>('/import/commit', { rows, campaignId }),
  },
  analytics: {
    overview: (q: AnalyticsQuery) => get<Overview>('/analytics/overview', q),
    timeseries: (q: AnalyticsQuery) => get<Timeseries>('/analytics/timeseries', q),
    topLinks: (q: AnalyticsQuery) => get<{ items: TopLink[] }>('/analytics/top-links', q),
    sources: (q: AnalyticsQuery) => get<{ total: number; items: Share[] }>('/analytics/sources', q),
    devices: (q: AnalyticsQuery) => get<{ total: number; items: (Share & { device: string })[] }>('/analytics/devices', q),
    cities: (q: AnalyticsQuery) => get<{ total: number; items: { city: string; count: number; pct: number }[] }>('/analytics/cities', q),
    alerts: () => get<{ newCount: number; items: AlertItem[] }>('/analytics/alerts'),
    markAlertsSeen: () => post<{ updated: number }>('/analytics/alerts/seen'),
    exportUrl: (q: AnalyticsQuery) => `${BASE}/analytics/export.csv${qs(q)}`,
  },
  stream: {
    token: () => get<{ token: string; url: string; expiresIn: number }>('/stream-token'),
  },
  bio: {
    list: () => get<{ items: BioPage[] }>('/bio'),
    create: (body: { slug: string; title: string; description?: string | null; theme?: string; links?: { linkId: string; label: string }[] }) =>
      post<{ page: BioPage }>('/bio', body),
    update: (id: string, body: { title?: string; description?: string | null; theme?: string; links?: { linkId: string; label: string }[] }) =>
      patch<{ page: BioPage }>(`/bio/${id}`, body),
    public: (slug: string) => get<PublicBio>(`/public/bio/${slug}`),
  },
  admin: {
    overview: () => get<AdminOverview>('/admin/overview'),
    flagged: () => get<{ items: Flag[] }>('/admin/flagged'),
    disable: (linkId: string, reason: string) => post<{ ok: true; status: LinkStatus }>(`/admin/links/${linkId}/disable`, { reason }),
    restore: (linkId: string, reason: string) =>
      post<{ ok: true; status: LinkStatus }>(`/admin/links/${linkId}/restore`, { reason }),
    dismiss: (flagId: string) => post<{ ok: true }>(`/admin/flagged/${flagId}/dismiss`),
    blocklist: () => get<{ items: BlockedDomain[] }>('/admin/blocklist'),
    block: (domain: string, reason: string) => post<{ domain: BlockedDomain }>('/admin/blocklist', { domain, reason }),
    unblock: (id: string) => del<{ ok: true }>(`/admin/blocklist/${id}`),
    audit: (limit = 50) => get<{ items: AuditItem[] }>('/admin/audit', { limit }),
    users: (q: { q?: string; status?: AccountFilter; page?: number; pageSize?: number }) => get<AdminUserList>('/admin/users', q),
    user: (id: string) => get<AdminUserDetail>(`/admin/users/${id}`),
    userLinks: (id: string, q: { q?: string; status?: 'all' | LinkStatus; page?: number; pageSize?: number }) =>
      get<AdminUserLinks>(`/admin/users/${id}/links`, q),
    /** `reset-password` also returns the temporary password, once (`temporaryPassword`, `expiresAt`). */
    userAction: (id: string, action: AccountAction, reason: string) =>
      post<{ ok: true; status: AccountStatus; temporaryPassword?: string; expiresAt?: string }>(`/admin/users/${id}/${action}`, { reason }),
  },
};
