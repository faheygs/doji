import {
  validWorkflowBatch,
  type WorkflowBatch,
} from '../../../contracts/mobileWorkflowTelemetry.ts';
import { monitorProject } from '../_shared/monitor-observation.ts';
type Dependencies = {
  enabled?: string;
  environment?: string;
  url?: string;
  now(): number;
  authenticate(token: string, signal: AbortSignal): Promise<string | null>;
  record(actor: string, batch: WorkflowBatch, signal: AbortSignal): Promise<string>;
};
const reply = (status: number) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store' } });
/** No member command, raw payload logging, provider call, automatic retry or public read. */
export async function handleMobileWorkflowReport(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  const project = monitorProject(deps.environment);
  if (deps.enabled !== 'true' || !project || deps.url !== `https://${project}.supabase.co`)
    return reply(404);
  if (request.method !== 'POST') return reply(405);
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization)) return reply(401);
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    return reply(415);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    let text = '',
      size = 0;
    const decoder = new TextDecoder();
    const cancel = () => {
      void reader.cancel().catch(() => undefined);
    };
    controller.signal.addEventListener('abort', cancel, { once: true });
    try {
      while (!controller.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) {
          text += decoder.decode();
          break;
        }
        size += chunk.value.byteLength;
        if (size > 8192) return reply(413);
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      cancel();
    }
    if (controller.signal.aborted) return reply(503);
    let batch: unknown;
    try {
      batch = JSON.parse(text);
    } catch {
      return reply(400);
    }
    if (!validWorkflowBatch(batch, deps.now())) return reply(400);
    const actor = await deps.authenticate(authorization.slice(7), controller.signal);
    if (
      !actor ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor)
    )
      return reply(401);
    if (controller.signal.aborted) return reply(503);
    const result = await deps.record(actor, batch, controller.signal);
    return reply(
      result === 'accepted' || result === 'duplicate' ? 204 : result === 'limited' ? 429 : 503,
    );
  };
  try {
    return await Promise.race([
      work().catch(() => reply(503)),
      new Promise<Response>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(reply(503));
        }, 2000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
