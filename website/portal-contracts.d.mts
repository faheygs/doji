import type { AdminPortalClient } from './admin-portal/live-client.mts';
import type { Cursor } from './admin-portal/live-contracts.d.mts';
import type { EditorialOptions } from './admin-portal/editorial-contracts.d.mts';
import type { SafetyClient } from './admin-portal/safety-contracts.d.mts';
import type { PrivacyClient } from './admin-portal/privacy-contracts.d.mts';
import type { BusinessReviewClient } from './admin-portal/business-applications.mts';

// Presentation DTOs for the existing authorized portal responses. Runtime
// permission, case-version and evidence-manifest checks remain in the controller.
export interface Profile {
  ownerName: string;
  companyName: string;
  legalName: string;
  website: string;
  description: string;
  industry: string;
  size: string;
  country: string;
  goal: string;
  markets: string[];
  logoDataUrl?: string;
}
export interface Doji {
  id: string;
  name: string;
  prompt: string;
  format: string;
  formatValue: string;
  liveDate: string;
  liveDateRaw?: string;
  status: string;
  label: string;
  reviewState?: string;
  reviewFeedback?: string;
  destination?: string;
  options: string[];
  answer_rule?: { type: string; count?: number; letter?: string } | null;
  results?: {
    eligible: number;
    opens: number;
    completions: number;
    reactions: number;
    comments: number;
  };
  revision?: number;
  previousSubmissions?: Doji[];
}
export interface Campaign {
  id: string;
  name: string;
  summary: string;
  goal: string;
  region: string;
  start: string;
  end: string;
  startRaw?: string;
  endRaw?: string;
  status: string;
  label: string;
  dojis: Doji[];
}
export interface Identity {
  id?: string;
  display_name?: string;
  username?: string;
  role?: string;
  is_banned?: boolean;
}
export interface HistoryEntry {
  action?: string;
  occurred_at?: string;
  actor?: Identity | null;
  actor_role?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}
export interface Appeal {
  id: string;
  report_id: string;
  decision_id: string;
  user?: Identity;
  content_kind?: string;
  policy_code?: string;
  submitted_at: string;
  severity?: string;
  statement: string;
  account_action?: string;
  original_decider_id?: string;
  status: string;
  reviewed_at?: string;
  reviewed_by?: Identity;
  review_reason?: string;
}
export type WorkItem = {
  id: string;
  queue: string;
  subject: string;
  secondary: string;
  category: string;
  submitted: string;
  deadline: string;
  status: string;
  label: string;
  priority: string;
  summary: string;
  visibility: string;
  owner?: string;
  source: string;
  nextStep?: string;
  history: (string | HistoryEntry)[];
  deadlineAt?: string | null;
  submittedAt?: string | null;
  resolvedAt?: string;
  severity?: string | null;
  assignedTo?: string | null;
  decisionId?: string | null;
  decisionAction?: string | null;
  policyCode?: string | null;
  accountAction?: string | null;
  appealStatus?: string | null;
  options?: string[];
  destination?: string;
  submittedBy?: Identity | null;
  appeal?: Appeal;
  businessStorageKey?: string;
  campaignId?: string;
};
export interface WireWork extends Omit<WorkItem, 'submitted' | 'deadline' | 'history'> {
  submitted_at?: string;
  deadline_at?: string;
  next_step?: string;
  assigned_to?: string;
  history?: HistoryEntry[];
  submitted_by?: Identity;
  resolved_at?: string;
  decision_id?: string;
  decision_action?: string;
  policy_code?: string;
  account_action?: string;
  appeal_status?: string;
}
export interface WireAudit extends HistoryEntry {
  id: string;
  category?: string;
  entity_type?: string;
  entity_id?: string;
  request_id?: string;
}
export interface AuditRow {
  id: string;
  type: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
  time: string;
  actorRole?: string;
  actionCode?: string;
  entityType?: string;
  entityId?: string;
  reason?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  timestamp?: string;
  repeatCount?: number;
  groupedIds?: string[];
}
export interface Announcement {
  id: string;
  title: string;
  type: string;
  audience: string;
  frequency: string;
  window: string;
  status: string;
  label: string;
}
export interface AdminState {
  overrides: Record<string, Partial<WorkItem>>;
  announcements: Announcement[];
  audit: AuditRow[];
}
export interface Asset {
  slot: string;
  kind: string;
  bucket: string;
  path: string;
  availability: string;
  url?: string | null;
  expiresAt?: number;
  desired?: string;
  phase?: string;
}
export interface Manifest {
  items: Asset[];
  access_gaps?: boolean;
  source?: string;
  decision_id?: string;
}
export interface Decision {
  original_decider_id?: string;
  content_kind?: string;
  email_status?: string;
  appeal_eligible?: boolean;
  id?: string;
  state?: string;
  action?: string;
  appeal_status?: string;
  account_action?: string;
  restriction_ends_at?: string;
  decided_by?: Identity;
  notice_status?: string;
  push_status?: string;
  policy_code?: string;
  severity?: string;
  account_action_state?: string;
  decider_deleted?: boolean;
  decided_at?: string;
  rationale?: string;
  member_notice?: string;
}
export interface CaseDetail extends Record<string, unknown> {
  current_decision?: Decision;
  policy_catalog?: { code: string; label: string }[];
  id: string;
  case_contract_version?: number;
  subject?: string;
  specific_concern?: string;
  summary?: string;
  reason_label?: string;
  reason?: string;
  reason_detail_label?: string;
  reason_detail?: string;
  notes?: string;
  category?: string;
  created_at?: string;
  status?: string;
  owner?: Identity;
  assigned_to?: string;
  priority?: string;
  reporter?: Identity;
  reported_user?: Identity;
  case_context?: {
    content_state?: string;
    content_created_at?: string;
    challenge_title?: string;
    audience_label?: string;
    audience?: string;
  };
  evidence?: {
    kind?: string;
    exists?: boolean;
    caption?: string;
    body?: string;
    custom_text?: string;
    has_profile_photo?: boolean;
    content_id?: string;
  };
  media_manifest?: Manifest;
  preserved_media_manifest?: Manifest;
  decision_summary?: Decision;
  triage_state?: {
    report_status?: string;
    queue?: string;
    owner?: Identity;
    assigned_to?: string;
    priority?: string;
    deadline_at?: string;
  };
  workflow_history?: HistoryEntry[];
  history?: HistoryEntry[];
  evidence_access?: { view_count?: number; last_viewed_at?: string; last_viewer?: Identity };
  related_context?: { prior_reports?: number; open_reports?: number; prior_enforcements?: number };
}
export interface AppealDetail {
  case_contract_version: number;
  appeal: Appeal;
  original_decision: Decision;
  original_evidence?: {
    media_manifest?: Manifest;
    preserved_media_manifest?: Manifest;
    avatar_reference_retained?: boolean;
  };
  report_case: CaseDetail;
  review_eligibility?: { can_review?: boolean; blocked_reason?: string };
}
export interface Snapshot {
  metrics?: Record<string, number>;
  work_items?: WireWork[];
  queue_health?: { key?: string; label: string; count: number; note?: string }[];
  next_event?: {
    fires_at: string;
    title?: string;
    activated_at?: string;
    prelive_at?: string;
    closes_at?: string;
  };
  announcements?: {
    id: string;
    title: string;
    kind: string;
    audience: string;
    max_impressions_per_user: number;
    starts_at: string;
    ends_at?: string;
    enabled: boolean;
  }[];
  release_policies?: {
    platform: string;
    minimum_version: string;
    minimum_build: number;
    latest_version: string;
    latest_build: number;
    enabled: boolean;
  }[];
}
export interface Health extends Record<string, unknown> {
  generated_at?: string;
  operational?: Record<string, unknown> & {
    checked_at?: string;
    realtime_sample_count_5m?: number;
  };
  sentry?: {
    configured?: boolean;
    available?: boolean;
    issues?: (Record<string, unknown> & { first_seen?: string; last_seen?: string })[];
  };
}
export interface HealthHistory {
  items?: (Record<string, unknown> & {
    observed_from?: string;
    activated_at?: string;
    fires_at: string;
    observed_through?: string;
    closes_at?: string;
  })[];
}
export interface Operators {
  truncated?: boolean;
  items?: {
    id: string;
    display_name?: string;
    username?: string;
    roles?: string[];
    status?: string;
    is_banned?: boolean;
    is_founder_admin?: boolean;
    last_changed_at?: string;
  }[];
}
export type PortalCursor = Cursor & { resolved_at?: string; report_id?: string };
export interface Page<T> {
  items?: T[];
  next_cursor?: PortalCursor | null;
}
export interface ActivePage {
  items: WorkItem[];
  cursor?: Cursor | null;
  loading?: boolean;
  error?: string;
}
export interface QueueWindow {
  offset: number;
  back: number[];
  error?: string;
}
export interface Intent {
  fingerprint: string;
  key: string;
}
type ModuleClient = EditorialOptions['client'] & Omit<SafetyClient, 'reportCase'> & PrivacyClient;
export type PortalClient = Omit<
  AdminPortalClient,
  | keyof ModuleClient
  | 'businessPage'
  | 'businessItem'
  | 'businessCommand'
  | 'auditExport'
  | 'resendEmployeeVerification'
  | 'commandCenter'
  | 'reportCase'
  | 'appealCase'
  | 'workQueue'
  | 'resolvedReports'
  | 'auditEvents'
  | 'operators'
  | 'platformHealth'
  | 'platformHealthHistory'
> &
  ModuleClient & {
    businessPage: BusinessReviewClient['page'];
    businessItem: BusinessReviewClient['detail'];
    businessCommand: BusinessReviewClient['command'];
    auditExport(
      ...args: Parameters<AdminPortalClient['auditExport']>
    ): Promise<{ items: WireAudit[]; truncated: boolean }>;
    resendEmployeeVerification(email: string): Promise<{ message: string }>;
    commandCenter(...args: Parameters<AdminPortalClient['commandCenter']>): Promise<Snapshot>;
    reportCase(id: string): Promise<CaseDetail>;
    appealCase(id: string): Promise<AppealDetail>;
    workQueue(...args: Parameters<AdminPortalClient['workQueue']>): Promise<Page<WireWork>>;
    resolvedReports(
      ...args: Parameters<AdminPortalClient['resolvedReports']>
    ): Promise<Page<WireWork>>;
    auditEvents(...args: Parameters<AdminPortalClient['auditEvents']>): Promise<Page<WireAudit>>;
    operators(): Promise<Operators>;
    platformHealth(): Promise<Health>;
    platformHealthHistory(limit?: number): Promise<HealthHistory>;
  };
