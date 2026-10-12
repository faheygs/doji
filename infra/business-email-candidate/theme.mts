// Business actions retain their narrow origin policy; visual primitives are shared.
import { renderEmailFrame, DOJI_EMAIL_LOGO } from '../../supabase/functions/_shared/email-theme.ts';
export const BUSINESS_EMAIL_LOGO = DOJI_EMAIL_LOGO;
export interface BusinessEmailPresentation {
  title: string;
  preheader: string;
  summary: string;
  action: { label: string; href: string };
  details?: { label: string; value: string }[];
  note?: string;
}
export function renderBusinessEmailHtml(input: BusinessEmailPresentation): string {
  const value = input.action.href,
    url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !['business.dojipro.com', 'dojipro.com'].includes(url.hostname) ||
    url.port ||
    /[\r\n]/.test(value)
  )
    throw Error('Invalid business email action');
  return renderEmailFrame({ ...input, brand: 'Doji for Business', actions: [input.action] });
}
