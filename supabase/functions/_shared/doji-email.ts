export type DojiEmailTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical';

export type DojiEmailFact = {
  label: string;
  value: string;
  monospace?: boolean;
};

export type DojiEmailSection = {
  heading: string;
  body?: string;
  bullets?: string[];
};

export type DojiEmailAction = {
  label: string;
  href: string;
  kind?: 'primary' | 'secondary';
};

export type DojiEmailInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  summary: string;
  tone?: DojiEmailTone;
  statusLabel?: string;
  facts?: DojiEmailFact[];
  sections?: DojiEmailSection[];
  actions?: DojiEmailAction[];
  reference?: string;
  footerNote?: string;
};

const TONES: Record<DojiEmailTone, { accent: string; soft: string; ink: string }> = {
  neutral: { accent: '#6f7788', soft: '#f0f2f6', ink: '#343a46' },
  info: { accent: '#5865f2', soft: '#eef0ff', ink: '#313b9c' },
  success: { accent: '#20b882', soft: '#e8f8f2', ink: '#0d704f' },
  warning: { accent: '#e9a23b', soft: '#fff6df', ink: '#8a5711' },
  danger: { accent: '#ff6547', soft: '#fff0ec', ink: '#9e2d1c' },
  critical: { accent: '#ff4f70', soft: '#ffedf1', ink: '#9f1834' },
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function humanizeEmailToken(value: unknown): string {
  const source = String(value ?? '').trim();
  if (!source) return 'Not available';
  return source
    .replace(/[_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatEmailTimestamp(value: unknown): string {
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

function safeHref(value: string): string {
  const href = value.trim();
  if (/^(https:\/\/|mailto:|doit:\/\/)/i.test(href)) return escapeHtml(href);
  return '#';
}

function richText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function renderFacts(facts: DojiEmailFact[]): string {
  if (facts.length === 0) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#f7f8fb;border:1px solid #e5e8ef;border-radius:16px;overflow:hidden;margin:0 0 24px;">
      ${facts
        .map(
          (fact, index) => `
        <tr>
          <td style="padding:13px 16px;${index > 0 ? 'border-top:1px solid #e5e8ef;' : ''}font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#737b8c;width:34%;vertical-align:top;">${escapeHtml(fact.label)}</td>
          <td style="padding:13px 16px;${index > 0 ? 'border-top:1px solid #e5e8ef;' : ''}font-family:${fact.monospace ? "'Courier New',Courier,monospace" : 'Arial,Helvetica,sans-serif'};font-size:14px;line-height:20px;font-weight:${fact.monospace ? '400' : '700'};color:#171a21;word-break:break-word;vertical-align:top;">${richText(fact.value)}</td>
        </tr>`,
        )
        .join('')}
    </table>`;
}

function renderSections(sections: DojiEmailSection[], accent: string): string {
  return sections
    .map(
      (section) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;">
      <tr>
        <td style="width:4px;background:${accent};border-radius:4px;">&nbsp;</td>
        <td style="padding:2px 0 2px 16px;">
          <p style="margin:0 0 7px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;font-weight:800;color:#171a21;">${escapeHtml(section.heading)}</p>
          ${section.body ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#555e70;">${richText(section.body)}</p>` : ''}
          ${section.bullets?.length ? `<ul style="margin:9px 0 0;padding:0 0 0 19px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#555e70;">${section.bullets.map((item) => `<li style="margin:0 0 5px;">${richText(item)}</li>`).join('')}</ul>` : ''}
        </td>
      </tr>
    </table>`,
    )
    .join('');
}

function renderActions(actions: DojiEmailAction[], accent: string): string {
  if (actions.length === 0) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 24px;">
      <tr>
        ${actions
          .map(
            (action) => `<td style="padding:0 10px 10px 0;">
          <a href="${safeHref(action.href)}" style="display:inline-block;padding:13px 18px;border-radius:12px;border:1px solid ${action.kind === 'secondary' ? '#d9dde6' : accent};background:${action.kind === 'secondary' ? '#ffffff' : accent};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:800;text-decoration:none;color:${action.kind === 'secondary' ? '#262b35' : '#ffffff'};">${escapeHtml(action.label)}</a>
        </td>`,
          )
          .join('')}
      </tr>
    </table>`;
}

function textDivider(): string {
  return '------------------------------------------------------------';
}

export function renderDojiEmail(input: DojiEmailInput): { html: string; text: string } {
  const tone = TONES[input.tone ?? 'neutral'];
  const facts = input.facts ?? [];
  const sections = input.sections ?? [];
  const actions = input.actions ?? [];
  const reference = input.reference?.trim();
  const footerNote =
    input.footerNote?.trim() ||
    'This is a transactional message from Doji. Please do not share passwords, sign-in codes, or private media by email.';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
    <style>
      @media only screen and (max-width: 680px) {
        .doji-shell { width: 100% !important; }
        .doji-card { border-radius: 0 !important; }
        .doji-pad { padding-left: 22px !important; padding-right: 22px !important; }
      }
      @media (prefers-color-scheme: dark) {
        .doji-page { background:#0d0f14 !important; }
        .doji-card { background:#171920 !important; }
        .doji-title { color:#ffffff !important; }
        .doji-copy { color:#c4c9d3 !important; }
      }
    </style>
  </head>
  <body class="doji-page" style="margin:0;padding:0;background:#eef0f4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef0f4;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" class="doji-shell" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:0 8px 14px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="width:38px;height:38px;border-radius:12px;background:#ff6547;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:38px;font-weight:900;color:#ffffff;">D</td>
                    <td style="padding-left:11px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:22px;font-weight:900;color:#171a21;">Doji</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="doji-card" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 14px 40px rgba(20,24,34,.09);">
                <div style="height:8px;background:${tone.accent};font-size:0;line-height:0;">&nbsp;</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td class="doji-pad" style="padding:38px 42px 34px;">
                      <p style="margin:0 0 13px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:${tone.accent};">${escapeHtml(input.eyebrow)}</p>
                      <h1 class="doji-title" style="margin:0 0 15px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;letter-spacing:-.025em;color:#171a21;">${escapeHtml(input.title)}</h1>
                      <p class="doji-copy" style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#555e70;">${richText(input.summary)}</p>
                      ${input.statusLabel ? `<div style="display:inline-block;margin:0 0 24px;padding:8px 12px;border-radius:999px;background:${tone.soft};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;color:${tone.ink};">${escapeHtml(input.statusLabel)}</div>` : ''}
                      ${renderFacts(facts)}
                      ${renderSections(sections, tone.accent)}
                      ${renderActions(actions, tone.accent)}
                      ${reference ? `<p style="margin:0;padding-top:18px;border-top:1px solid #e6e9ef;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#767e8e;word-break:break-all;">Reference ${escapeHtml(reference)}</p>` : ''}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7a8291;">
                ${escapeHtml(footerNote)}<br>
                <a href="https://dojipro.com/support/" style="color:#565fef;text-decoration:none;font-weight:700;">Doji Support</a>
                &nbsp;&middot;&nbsp;
                <a href="https://dojipro.com/community-guidelines/" style="color:#565fef;text-decoration:none;font-weight:700;">Community Guidelines</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'DOJI',
    input.eyebrow.toUpperCase(),
    input.title,
    input.summary,
    input.statusLabel ? `Status: ${input.statusLabel}` : '',
    facts.length ? textDivider() : '',
    ...facts.map((fact) => `${fact.label}: ${fact.value}`),
    ...sections.flatMap((section) => [
      textDivider(),
      section.heading,
      section.body ?? '',
      ...(section.bullets ?? []).map((item) => `- ${item}`),
    ]),
    actions.length ? textDivider() : '',
    ...actions.map((action) => `${action.label}: ${action.href}`),
    reference ? `${textDivider()}\nReference: ${reference}` : '',
    textDivider(),
    footerNote,
    'Support: https://dojipro.com/support/',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { html, text };
}
