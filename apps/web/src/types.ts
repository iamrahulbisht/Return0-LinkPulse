// Shapes returned by the Express API (apps/api/src/routes/*). Keep in sync with the server.

export type Role = 'user' | 'admin';
export type LinkStatus = 'active' | 'expired' | 'limit_reached' | 'disabled';
export type Device = 'ios' | 'android' | 'desktop';
export type ClickSource = 'link' | 'qr' | 'bio';
export type ClickType = 'human' | 'preview_bot' | 'scanner' | 'suspicious';
export type Period = '24h' | '7d' | '30d';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Path under the API base (e.g. "/me/avatar?v=123"), or null when there is no photo. */
  avatarPath?: string | null;
}

export interface Profile {
  user: User & { createdAt: string; avatarPath: string | null };
  workspace: { id: string; name: string; isOwner: boolean };
  stats: { links: number; campaigns: number; qrCodes: number; humanClicks: number };
}

export type WorkspaceRole = 'owner' | 'member';

export interface Me {
  user: User;
  /** The active workspace: every list, new link and chart uses it. */
  workspace: { id: string; name: string; role: WorkspaceRole };
  /** `invites` = invitations waiting for me (the notification badge). */
  counts: { links: number; openFlags: number; invites: number };
  /** Set after an admin password reset: the app shows only "Set a new password" until it is done. */
  passwordReset?: { reason: string | null; at: string | null } | null;
}

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  ownerName: string;
  members: number;
  isActive: boolean;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
  isYou: boolean;
}

/** An open invite as the workspace owner sees it. */
export interface SentInvite {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: string;
}

export interface WorkspaceMembers {
  workspace: { id: string; name: string; isOwner: boolean };
  members: WorkspaceMember[];
  /** Only filled for the owner. */
  invites: SentInvite[];
}

/** An invite sent to me. */
export interface ReceivedInvite {
  id: string;
  workspace: { id: string; name: string; ownerName: string; members: number };
  invitedBy: string;
  createdAt: string;
}

export interface ApiErrorField {
  field: string;
  code: string;
  message: string;
  suggestions?: string[];
}

export interface DeviceRule {
  id?: string;
  device: Device;
  destination: string;
  priority?: number;
}

export interface Link {
  id: string;
  code: string;
  shortUrl: string;
  customAlias: boolean;
  destination: string;
  title: string | null;
  status: LinkStatus;
  disabledReason: string | null;
  expiresAt: string | null;
  fallbackUrl: string | null;
  clickLimit: number | null;
  clickCount: number;
  hasPassword: boolean;
  campaign: { id: string; name: string } | null;
  tags: string[];
  rules: DeviceRule[];
  owner: { id: string; name: string } | null;
  qrCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkList {
  items: Link[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<'all' | LinkStatus, number>;
}

export interface LinkDetail {
  link: Link;
  stats: { humanClicks: number; uniqueVisitors: number; botsFiltered: number; qrScans: number; qrLocations: number };
  scansByQr: { id: string; label: string; scans: number }[];
  /** A platform admin viewing a link outside their workspaces: changes need a reason the owner will see. */
  adminView?: boolean;
}

export type CheckState = 'ok' | 'bad' | 'wait';

export interface ValidateResult {
  ok: boolean;
  checks: { id: 'url' | 'block' | 'loop' | 'alias'; label: string; state: CheckState; note: string }[];
  destination: { host: string | null; issues: ApiErrorField[] };
  alias: { value: string; state: 'ok' | 'bad' | 'empty'; message: string | null; code: string | null; suggestions: string[] };
}

export interface CreateLinkBody {
  destination: string;
  alias?: string | null;
  title?: string | null;
  campaignId?: string | null;
  tags?: string[];
  /** IST date YYYY-MM-DD; the link stops at 11:59 PM IST that day. */
  expiresOn?: string | null;
  fallbackUrl?: string | null;
  clickLimit?: number | null;
  password?: string | null;
  rules?: { device: Device; destination: string }[];
}

export interface Visit {
  id: string;
  at: string;
  source: ClickSource;
  channel: string;
  qrLabel: string | null;
  device: string;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  clickType: ClickType;
  counted: boolean;
}

/** One click pushed over the live stream (SSE). */
export interface LiveClick {
  id: string;
  linkId: string;
  code: string;
  at: string;
  source: ClickSource;
  qrLabel: string | null;
  referrer: string | null;
  device: string;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  clickType: ClickType;
  counted: boolean;
}

export interface HistoryItem {
  id: string;
  action: string;
  text: string;
  actor: string;
  reason: string | null;
  at: string;
  /** On the admin user page and in Account notices: the short link an admin change was about. */
  link?: string | null;
}

export type CampaignState = 'running' | 'ended' | 'scheduled' | 'no_dates';

export interface Campaign {
  id: string;
  name: string;
  startsAt: string | null; // YYYY-MM-DD
  endsAt: string | null;
  state: CampaignState;
  progress: number;
  links: number;
  humanClicks: number;
  uniqueVisitors: number;
  botsFiltered: number;
  createdAt: string;
  top: { id: string; code: string; clicks: number }[];
}

export interface Tag {
  id: string;
  name: string;
  links?: number;
}

export interface QrCode {
  id: string;
  linkId: string;
  code: string;
  locationLabel: string;
  fgColor: string;
  scans: number;
  target: string;
  createdAt: string;
  warning: string | null;
}

export interface Overview {
  period: Period;
  humanClicks: number;
  previousHumanClicks: number;
  changePct: number | null;
  uniqueVisitors: number;
  botsFiltered: number;
  links: { total: number; active: number; expired: number; limit_reached: number; disabled: number };
  lastClickAt: string | null;
  generatedAt: string;
}

export interface Timeseries {
  period: Period;
  unit: 'hour' | 'day';
  timezone: string;
  /** bucket = IST wall-clock "YYYY-MM-DDTHH:mm" */
  points: { bucket: string; human: number; bots: number }[];
}

export interface TopLink {
  id: string;
  code: string;
  campaign: string | null;
  humanClicks: number;
  status: LinkStatus;
  clickLimit: number | null;
  clickCount: number;
}

export interface Share {
  name: string;
  count: number;
  pct: number;
}

export interface AlertItem {
  id: string;
  type: 'expiring' | 'near_limit' | 'spike' | 'bots' | 'blocked';
  message: string;
  createdAt: string;
  seen: boolean;
  link: { id: string; code: string; clickLimit: number | null; clickCount: number; expiresAt: string | null };
}

export type ImportResult = 'valid' | 'alias_taken' | 'duplicate_in_file' | 'invalid_url' | 'blocked_domain' | 'invalid_alias';

export interface ImportRow {
  row: number;
  alias: string;
  destination: string;
  tags: string[];
  result: ImportResult;
  fix: string | null;
  suggestions: string[];
  linkId?: string;
  code?: string;
}

export interface ImportPreview {
  fileName: string;
  columns: string[];
  rows: ImportRow[];
  summary: Record<'total' | ImportResult, number>;
}

export interface BioPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  theme: string;
  publicPath: string;
  bioClicks?: number;
  links: { linkId: string; label: string; position: number; code: string; status: LinkStatus; expiresAt: string | null; bioClicks?: number }[];
}

export interface PublicBio {
  slug: string;
  title: string;
  description: string | null;
  theme: string;
  initials: string;
  links: { label: string; href: string; status: LinkStatus; expiresAt: string | null }[];
}

export interface AdminOverview {
  links: number;
  workspaces: number;
  humanClicks24h: number;
  botHits24h: number;
  needsReview: number;
  blockedDomains: number;
}

export interface Flag {
  id: string;
  type: 'spike' | 'report' | 'blocked' | 'bots';
  label: string;
  reason: string;
  createdAt: string;
  link: { id: string; code: string; shortUrl: string; destination: string; status: LinkStatus; disabledReason: string | null; owner: string };
}

export interface BlockedDomain {
  id: string;
  domain: string;
  reason: string;
  createdAt: string;
  linksHit: number;
}

export interface AuditItem {
  id: string;
  action: string;
  text: string;
  target: string;
  actor: string;
  reason: string | null;
  at: string;
}

/** Admin user management (docs/design/admin-management.md). Derived on the server, like link status. */
export type AccountStatus = 'active' | 'suspended' | 'locked' | 'password_reset';
export type AccountFilter = 'all' | 'active' | 'suspended' | 'locked';
export type AccountAction = 'suspend' | 'reactivate' | 'unlock' | 'sign-out' | 'reset-password';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
  links: number;
  workspaces: number;
}

export interface AdminUserList {
  items: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AccountFilter, number>;
}

export interface AdminUserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    status: AccountStatus;
    suspendedReason: string | null;
    lockedUntil: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
  workspaces: { id: string; name: string; role: WorkspaceRole; isOwner: boolean; members: number; links: number; joinedAt: string }[];
  links: Record<'all' | LinkStatus, number>;
  history: HistoryItem[];
}

export interface AdminUserLinks {
  items: (Link & { workspace: { id: string; name: string } })[];
  total: number;
  page: number;
  pageSize: number;
}
