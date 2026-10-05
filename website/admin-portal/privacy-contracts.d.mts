import type { ApplicationDetails } from '../business-portal/application-form.mts';
export interface PrivacyHistory {
  revision: number;
  action: string;
  occurred_at: string;
  evidence_reference?: string;
  response?: string;
}
export interface PrivacyCase {
  id: string;
  account_id: string;
  kind: string;
  state: string;
  revision: number;
  due_at: string;
  received_at?: string;
  verification_reference?: string;
  history: PrivacyHistory[];
  history_has_more: boolean;
  hold?: { reference: string; case_id: string } | null;
}
export interface PrivacyApplication {
  id: string;
  revision: number;
  state: string;
  details: ApplicationDetails;
  response?: string;
}
export interface PrivacyCorrection {
  case_id: string;
  account_id: string;
  case_revision: number;
  correction_allowed: boolean;
  blocked_reason: string | null;
  application: PrivacyApplication;
}
export interface PrivacyAccess {
  case_id: string;
  account_id: string;
  history_has_more: boolean;
  history: PrivacyHistory[];
  identity?: { name?: string; email?: string };
  signup_agreement?: { terms_version?: string; privacy_version?: string; accepted_at?: string };
  application?: PrivacyApplication | null;
  submissions: {
    submission: number;
    details: ApplicationDetails;
    terms_version?: string;
    privacy_version?: string;
    accepted_at?: string;
  }[];
}
export type PrivacyRequest = Record<string, unknown>;
export interface PrivacyClient {
  businessPrivacyPage(input: PrivacyRequest): Promise<PrivacyCase[]>;
  businessPrivacyCase(input: PrivacyRequest): Promise<PrivacyCase>;
  businessPrivacyCorrection(input: PrivacyRequest): Promise<PrivacyCorrection>;
  businessPrivacyAccess(input: PrivacyRequest): Promise<PrivacyAccess>;
  businessPrivacyCommand(
    input: PrivacyRequest,
  ): Promise<Pick<PrivacyCase, 'id' | 'state' | 'revision'>>;
  businessPrivacyOpen(
    input: PrivacyRequest,
  ): Promise<Pick<PrivacyCase, 'id' | 'state' | 'revision'>>;
}
export interface PrivacyOptions {
  root: HTMLElement;
  client: PrivacyClient;
  session():
    | { capabilities?: { operator_manage?: boolean; legal_read?: boolean } }
    | null
    | undefined;
  epoch(): number;
}
export interface PrivacyIntent {
  body: PrivacyRequest;
  summary: string;
}
