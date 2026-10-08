import { createBusinessMfa } from '../business-mfa.mts';
import { control } from './config.mts';
import type { createBusinessBrowserClient } from '../../../infra/portal-identity-candidate/business-browser-client.mts';
export function independentWorkspace(
  client: ReturnType<typeof createBusinessBrowserClient>,
  message: (text: string) => void,
) {
  const actions = control('businessWorkspaceActions'),
    button = control<HTMLButtonElement>('businessOpenWorkspace');
  const panel = control('businessVerifiedWorkspace'),
    summary = control('businessWorkspaceSummary');
  let generation = 0,
    approved = false;
  const clear = () => {
    generation++;
    panel.hidden = true;
    summary.textContent = '';
  };
  client.onClear(() => {
    clear();
    approved = false;
    actions.hidden = true;
  });
  async function show() {
    const stamp = generation,
      epoch = client.epoch();
    const result = await client.workspace();
    if (stamp !== generation || epoch !== client.epoch() || !approved) return;
    summary.textContent = `${result.brand} · ${result.role}`;
    panel.hidden = false;
  }
  const mfa = createBusinessMfa(control('businessWorkspaceMfa'), client, show, message);
  button.addEventListener('click', async () => {
    if (!approved || button.disabled) return;
    button.disabled = true;
    message('');
    try {
      if (client.assurance() === 'aal2') await show();
      else await mfa.open();
    } catch (error) {
      message(error instanceof Error ? error.message : 'Business verification unavailable.');
    } finally {
      button.disabled = false;
    }
  });
  return (isApproved: boolean) => {
    approved = isApproved && client.hasSession();
    actions.hidden = !approved;
    if (!approved) {
      clear();
      mfa.clear();
    }
  };
}
