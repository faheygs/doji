import { renderEmailFrame } from './email-theme.ts';
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
  brand?: 'Doji' | 'Doji for Business' | 'Doji Workspace';
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

function textDivider(): string {
  return '------------------------------------------------------------';
}
export function renderDojiEmail(input: DojiEmailInput): { html: string; text: string } {
  const tone = TONES[input.tone ?? 'neutral'],
    facts = input.facts ?? [],
    sections = input.sections ?? [],
    actions = input.actions ?? [],
    reference = input.reference?.trim();
  const footerNote =
    input.footerNote?.trim() ||
    'This is a transactional message from Doji. Please do not share passwords, sign-in codes, or private media by email.';
  const html = renderEmailFrame({
    brand: input.brand,
    eyebrow: input.eyebrow,
    title: input.title,
    preheader: input.preheader,
    summary: input.summary,
    actions,
    details: [...facts, ...(reference ? [{ label: 'Reference', value: reference }] : [])],
    sections,
    status: input.statusLabel
      ? { label: input.statusLabel, background: tone.soft, color: tone.ink }
      : undefined,
    footerNote,
    communityLink: input.brand !== 'Doji for Business',
  });
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
