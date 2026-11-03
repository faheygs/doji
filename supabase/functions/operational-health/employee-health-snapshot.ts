type RpcResult = { data?: unknown; error?: unknown };
type Capture = (
  args: { p_project_ref: string; p_health: Record<string, unknown> },
  signal: AbortSignal,
) => PromiseLike<RpcResult>;
export const snapshotDeadlineMs = 2000;

/** A sidecar of the existing collector, never a new timer or a member dependency. */
export async function captureEmployeeHealthSnapshot(
  config: { enabled: boolean; eventsEnabled: boolean; environment?: string; supabaseUrl?: string },
  health: Record<string, unknown>,
  capture: Capture,
): Promise<boolean> {
  if (!config.enabled) return false;
  const project =
    config.environment === 'staging'
      ? 'ohrcupagdoilkwhecict'
      : config.environment === 'production'
        ? 'tvixsmqxotuvyjqzmjla'
        : null;
  // A cutover must disable the paid health broadcast, not silently run both paths.
  if (config.eventsEnabled || !project || config.supabaseUrl !== `https://${project}.supabase.co`)
    return false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, snapshotDeadlineMs);
    });
    const save = Promise.resolve()
      .then(() => capture({ p_project_ref: project, p_health: health }, controller.signal))
      .then(
        (result) => !controller.signal.aborted && !result.error && result.data === true,
        () => false,
      );
    return await Promise.race([save, deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
