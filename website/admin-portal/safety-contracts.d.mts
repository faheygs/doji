export interface SafetyCursor {
  at: string;
  id: string;
}
export interface SafetySummary {
  id: string;
  revision: number;
  state: string;
  received_at: string;
  deadline_at: string;
  reason_label?: string;
  reason?: string;
  detail_label?: string;
  detail?: string;
}
export interface SafetyCase extends SafetySummary {
  queue: string;
  closed_at?: string | null;
  can_write?: boolean;
  report_id?: string | null;
  public_message?: string;
  alert_state?: string;
  request?: Partial<
    Record<
      | 'reason'
      | 'detail'
      | 'name'
      | 'contact'
      | 'relationship'
      | 'location'
      | 'statement'
      | 'signature',
      string
    >
  >;
  classification?: { reason_label?: string; detail_label?: string; targets?: string[] };
  history?: {
    action: string;
    occurred_at: string;
    internal_note?: string;
    public_message?: string;
  }[];
}
export interface SafetyCommand {
  p_id: string;
  p_revision: number;
  p_command_id: string;
  p_input: Record<string, FormDataEntryValue>;
}
export interface SafetyTarget {
  case_id: string;
  id: string;
  kind: string;
  fingerprint: string;
  username?: string;
  owner_id: string;
  detail?: Record<string, unknown>;
}
export interface SafetyReport {
  id: string;
  [key: string]: unknown;
}
export interface SafetyClient {
  hasSession(): boolean;
  reportCase(id: string): Promise<SafetyReport>;
  safetyCase(id: string): Promise<SafetyCase>;
  safetyPage(
    cursor: SafetyCursor | null,
    closed: boolean,
    queue: string,
  ): Promise<{ items: SafetySummary[]; next_cursor: SafetyCursor | null }>;
  safetyTarget(id: string, kind: string, targetId: string): Promise<SafetyTarget>;
  safetyCreateReport(
    input: SafetyCommand,
  ): Promise<{ id: string; outcome: string; revision: number }>;
  safetyCommand(input: SafetyCommand): Promise<{ id: string; outcome: string; revision: number }>;
}
export interface SafetyOptions {
  client: SafetyClient;
  session():
    | { capabilities?: { legal_read?: boolean; moderation_read?: boolean } }
    | null
    | undefined;
  epoch(): number;
  enhanceControls(root: HTMLElement): void;
  openReport(detail: SafetyReport): void;
  view?: string;
}
export interface SafetyRemovalModule {
  create(options: SafetyOptions): { reconcile(): Promise<void>; clear(): void };
}
declare global {
  interface Window {
    DojiSafetyRemoval: SafetyRemovalModule;
  }
  interface DocumentEventMap {
    'portal:view': CustomEvent<string>;
  }
}
