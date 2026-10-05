export interface EditorialCursor {
  at: string;
  id: string;
}
export interface EditorialContent {
  id?: string;
  title?: string;
  body?: string;
  kind?: string;
  options?: unknown;
  starts_at?: string;
  ends_at?: string;
  cta_label?: string;
  cta_url?: string;
  priority?: number | string;
  max_impressions_per_user?: number | string;
  min_hours_between_impressions?: number | string;
  reward_action?: string | null;
  reward_sparks?: number | string;
  reason?: string;
}
export interface EditorialItem extends EditorialContent {
  id: string;
  title: string;
  version: number;
  display_state: string;
  created_at: string;
  can_write?: boolean;
  managed?: boolean;
  state?: string;
  status?: string;
  allowed_actions?: string[];
  author?: string;
  admin_note?: string;
  username?: string;
  reviewed_at?: string;
  reviewer?: string;
  pool_active?: boolean;
  challenge_id?: string;
  scheduled_at?: string;
  review_blocked_reason?: string;
  recent_history?: { action: string; occurred_at: string; reason?: string }[];
  item_unavailable?: boolean;
  outcome?: string;
}
export interface EditorialCommand {
  kind: string;
  action: string;
  id: string | null;
  version: number | null;
  input: EditorialContent;
  reason: string;
  idempotencyKey?: string;
}
export interface EditorialOptions {
  client: {
    hasSession(): boolean;
    editorialPage(
      kind: string,
      cursor: EditorialCursor | null | undefined,
      filter: string,
    ): Promise<{ items: EditorialItem[]; next_cursor: EditorialCursor | null; can_write: boolean }>;
    editorialItem(kind: string, id: string): Promise<EditorialItem>;
    editorialCommand(command: EditorialCommand): Promise<EditorialItem>;
  };
  session():
    | { capabilities?: { operations_read?: boolean; operator_manage?: boolean } }
    | null
    | undefined;
  epoch(): number;
  onSaved(): void;
  enhanceControls(root: HTMLElement): void;
  campaignsEnabled?: boolean;
}
export interface EditorialPage {
  host: HTMLElement;
  cursors: (EditorialCursor | null)[];
  index: number;
  next: EditorialCursor | null;
  items: EditorialItem[];
  revision: number;
  loaded: boolean;
  loading: boolean;
  write: boolean;
  filter: string;
}
export interface DraftFields extends EditorialContent {
  title: string;
  body: string;
  starts_at: string;
  ends_at: string;
  cta_label: string;
  cta_url: string;
  reason: string;
  reward_mode?: string;
}
export interface IdeaResponse {
  label?: string;
  choices?: string[];
  count?: unknown;
  letter?: string;
  error?: string;
}
declare global {
  interface Window {
    DojiAdminEditorial: {
      create(options: EditorialOptions): {
        open(kind: string, id: string): Promise<void>;
        clear(): void;
        reconcile(): void;
      };
    };
  }
}
