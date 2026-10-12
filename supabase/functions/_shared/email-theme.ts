// Shared presentation only; no recipients, tokens, providers or send policy.
export const DOJI_EMAIL_LOGO = 'https://business.dojipro.com/doji-icon.png';
export interface EmailFrame {
  brand?: 'Doji' | 'Doji for Business' | 'Doji Workspace';
  title: string;
  preheader: string;
  summary: string;
  eyebrow?: string;
  actions: { label: string; href: string; kind?: 'primary' | 'secondary' }[];
  details?: { label: string; value: string; monospace?: boolean }[];
  sections?: { heading: string; body?: string; bullets?: string[] }[];
  status?: { label: string; background: string; color: string };
  note?: string;
  footerNote?: string;
  communityLink?: boolean;
}
export const escapeEmailHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
function href(value: string) {
  const clean = value.trim();
  if (/[\r\n]/.test(value)) return '#';
  try {
    const url = new URL(clean);
    if (!['https:', 'mailto:', 'doit:'].includes(url.protocol) || url.username || url.password)
      return '#';
    return escapeEmailHtml(clean);
  } catch {
    return '#';
  }
}
function button(label: string, value: string, primary: boolean) {
  const background = primary ? '#b83b1b' : '#ffffff',
    color = primary ? '#ffffff' : '#b83b1b';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate"><tr><td align="center" bgcolor="${background}" style="background:${background};border:1px solid ${primary ? background : '#e7e3df'};border-radius:10px;mso-padding-alt:14px 22px"><a href="${href(value)}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:${color};text-decoration:none;mso-padding-alt:0">${escapeEmailHtml(label)}</a></td></tr></table>`;
}
export function renderEmailFrame(input: EmailFrame): string {
  const e = escapeEmailHtml,
    brand = input.brand ?? 'Doji';
  const details = (input.details ?? [])
    .map(
      (item) =>
        `<tr><td style="padding:10px 0;color:#62616b;font-size:12px;line-height:18px">${e(item.label)}<br><span style="color:#101114;font-size:14px;${item.monospace ? 'font-family:monospace;' : ''}overflow-wrap:anywhere;word-break:break-word">${e(item.value).replace(/\r?\n/g, '<br>')}</span></td></tr>`,
    )
    .join('');
  const actions = input.actions
    .map(
      (action, index) =>
        `${index ? '<div style="height:12px;line-height:12px">&nbsp;</div>' : ''}${button(action.label, action.href, action.kind !== 'secondary')}`,
    )
    .join('');
  const sections = (input.sections ?? [])
    .map(
      (section) =>
        `<div style="text-align:left;margin-top:24px"><h2 class="doji-heading" style="font-size:17px;line-height:24px;margin:0 0 8px;color:#101114">${e(section.heading)}</h2>${section.body ? `<p class="doji-copy" style="font-size:14px;line-height:23px;color:#62616b;margin:0">${e(section.body).replace(/\r?\n/g, '<br>')}</p>` : ''}${section.bullets?.length ? `<ul class="doji-copy" style="font-size:14px;line-height:23px;color:#62616b;padding-left:20px">${section.bullets.map((item) => `<li>${e(item)}</li>`).join('')}</ul>` : ''}</div>`,
    )
    .join('');
  const status =
    input.status &&
    /^#[a-f0-9]{6}$/i.test(input.status.background) &&
    /^#[a-f0-9]{6}$/i.test(input.status.color)
      ? `<p style="display:inline-block;border-radius:16px;padding:8px 12px;font-size:12px;line-height:18px;font-weight:700;background:${input.status.background};color:${input.status.color};margin:0 0 24px">${e(input.status.label)}</p>`
      : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="referrer" content="no-referrer"><title>${e(input.title)}</title>
<style>@media only screen and (max-width:620px){.doji-pad{padding:28px 22px!important}.doji-title{font-size:28px!important;line-height:34px!important}}@media (prefers-color-scheme: dark){.doji-page{background:#101114!important}.doji-card{background:#1a1b20!important;border-color:#35343e!important}.doji-title,.doji-heading{color:#f7f5f2!important}.doji-copy{color:#b6b5bd!important}.doji-brand{color:#ff9878!important}}</style></head>
<body class="doji-page" style="margin:0;padding:0;background:#fbfaf8;font-family:Arial,Helvetica,sans-serif;color:#101114">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${e(input.preheader)}</div>
<table role="presentation" class="doji-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fbfaf8"><tr><td align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" class="doji-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #e7e3df;border-top:4px solid #ff643c;border-radius:18px;border-collapse:separate">
<tr><td class="doji-pad" align="center" style="padding:36px 40px">
<img src="${DOJI_EMAIL_LOGO}" alt="Doji logo" width="56" height="56" style="display:block;width:56px;height:56px;border:0;border-radius:12px;background:#ffffff">
<p class="doji-brand" style="margin:14px 0 30px;font-size:13px;line-height:20px;letter-spacing:1.5px;font-weight:700;color:#b83b1b">${e(brand.toUpperCase())}</p>
${input.eyebrow ? `<p class="doji-copy" style="font-size:12px;line-height:18px;letter-spacing:1px;color:#62616b;margin:0 0 12px">${e(input.eyebrow)}</p>` : ''}
<h1 class="doji-title" style="margin:0 0 18px;font-size:32px;line-height:38px;letter-spacing:-0.8px;color:#101114">${e(input.title)}</h1>
<p class="doji-copy" style="margin:0 0 28px;font-size:16px;line-height:26px;color:#62616b">${e(input.summary).replace(/\r?\n/g, '<br>')}</p>
${status}${actions}
${details ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;padding:8px 16px;border:1px solid #e7e3df;border-radius:10px;background:#fbfaf8;text-align:left">${details}</table>` : ''}
${sections}
${input.note ? `<p class="doji-copy" style="margin:24px 0 0;font-size:13px;line-height:21px;color:#62616b">${e(input.note)}</p>` : ''}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px"><tr><td align="center" style="padding:22px 12px 0"><p class="doji-copy" style="margin:0 0 14px;font-size:12px;line-height:19px;color:#62616b">${input.footerNote ? e(input.footerNote) + '<br>' : ''}Sent by ${e(brand)}</p>${button('Contact Doji', 'https://dojipro.com/support/', false)}${input.communityLink ? '<div style="height:12px;line-height:12px">&nbsp;</div>' + button('Community guidelines', 'https://dojipro.com/community-guidelines/', false) : ''}</td></tr></table>
</td></tr></table></body></html>`;
}
