import type { WorkRef } from './workflow-contracts.mts';
import type { AppealDetail, CaseDetail, WorkItem } from '../portal-contracts.d.mts';
interface Options {
  epoch(): number;
  active(): boolean;
  business: Promise<{ open(id: string): Promise<void> } | null>;
  privacy: Promise<{ open(id: string): Promise<void> } | null>;
  intake?: { open(id: string): Promise<void> };
  idea?: { open(kind: 'suggestions', id: string): Promise<void> } | null;
  report(id: string): Promise<CaseDetail>;
  appeal(id: string): Promise<AppealDetail>;
  drawer(item: WorkItem): unknown;
}
// Opening a review performs authorized reads only. The existing domain surface
// still validates its complete evidence contract before enabling any command.
export function workflowReview(options: Options) {
  return async (ref: WorkRef) => {
    const epoch = options.epoch();
    const assertActive = () => {
      if (!options.active() || epoch !== options.epoch()) throw Error('Review session changed');
    };
    assertActive();
    if (ref.kind === 'business_application' || ref.kind === 'business_privacy') {
      const module = await (ref.kind === 'business_application'
        ? options.business
        : options.privacy);
      assertActive();
      if (!module) throw Error('Review unavailable');
      await module.open(ref.id);
      return;
    }
    if (ref.kind === 'external_intake') {
      if (!options.intake) throw Error('External review unavailable');
      await options.intake.open(ref.id);
      return;
    }
    if (ref.kind === 'suggestion') {
      if (!options.idea) throw Error('Editorial review unavailable');
      await options.idea.open('suggestions', ref.id);
      return;
    }
    const appeal = ref.kind === 'appeal' ? await options.appeal(ref.id) : null;
    assertActive();
    const report = appeal ? appeal.report_case : await options.report(ref.id);
    assertActive();
    if (
      report.case_contract_version !== 3 ||
      (appeal
        ? appeal.appeal.id !== ref.id || appeal.appeal.report_id !== report.id
        : report.id !== ref.id)
    )
      throw Error('Review identity mismatch');
    const at = appeal?.appeal.submitted_at || report.created_at;
    await options.drawer({
      id: ref.id,
      queue: report.triage_state?.queue === 'restricted_safety' ? 'safety' : 'moderation',
      subject: appeal ? 'Moderation appeal' : report.subject || 'Content report',
      secondary: 'Verified review record',
      category: appeal ? 'Appeal' : 'Report',
      submitted: at ? new Date(at).toLocaleString() : 'Time unavailable',
      deadline: appeal ? 'Independent review required' : '24-hour internal review target',
      status: appeal ? 'appeal' : report.status || 'pending',
      label: appeal ? 'Appeal' : 'Report',
      priority: 'normal',
      summary: 'Review the complete evidence and history before deciding.',
      visibility: 'See current evidence',
      owner: 'See current ownership',
      source: 'Unified review workspace',
      history: [],
      ...(appeal ? { appeal: appeal.appeal } : {}),
    });
  };
}
