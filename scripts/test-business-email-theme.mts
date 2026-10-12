import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBusinessEmailHtml } from '../infra/business-email-candidate/theme.mts';
const input = {
  title: 'Your business is approved',
  preheader: 'Finish setup',
  summary: 'Your next step.',
  action: { label: 'Finish setup', href: 'https://business.dojipro.com/business-portal/setup/' },
};
test('HTML has one real logo, named brand, preheader, compact buttons and text outside images', () => {
  const html = renderBusinessEmailHtml(input);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /DOJI FOR BUSINESS/);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /alt="Doji logo" width="56" height="56"/);
  assert.match(html, /background:#b83b1b/);
  assert.match(html, /color:#ffffff/);
  assert.match(html, />Finish setup<\/a>/);
  assert.match(html, />Contact Doji<\/a>/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(html, /<script|<form|<iframe|data:|<link|@import|tracking/i);
  for (const text of html.matchAll(/<a\b[^>]*>(.*?)<\/a>/g))
    assert.doesNotMatch(text[1]!, /https?:/);
});
test('every content slot is escaped, with no raw HTML slot', () => {
  const value = '<img src=x onerror="bad"> & unsafe';
  const html = renderBusinessEmailHtml({
    ...input,
    title: value,
    preheader: value,
    summary: value,
    action: { ...input.action, label: value },
    details: [{ label: value, value }],
    note: value,
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; unsafe/);
});
test('actions reject non-Doji destinations and preserve encoded reset fragments', () => {
  for (const href of [
    'javascript:alert(1)',
    'http://business.dojipro.com/',
    'https://evil.invalid/',
    'https://business.dojipro.com.evil.invalid/',
    'https://user@business.dojipro.com/',
    'https://business.dojipro.com:444/',
    'https://business.dojipro.com/\n',
  ])
    assert.throws(() => renderBusinessEmailHtml({ ...input, action: { ...input.action, href } }));
  const href =
    'https://business.dojipro.com/business-portal/access/?mode=reset#token=synthetic%2B%26%3F';
  assert.ok(
    renderBusinessEmailHtml({ ...input, action: { ...input.action, href } }).includes(
      `href="${href}"`,
    ),
  );
});
