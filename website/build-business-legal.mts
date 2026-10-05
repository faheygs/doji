// Publish the owner-approved baseline with verified launch facts, not its editorial checklist.
// Versioned outputs are retained in the exact release manifest; changes need a new version.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const inline = (s: string) =>
  escape(s).replace(
    /\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
export async function buildBusinessLegal(output: string) {
  for (const kind of ['TERMS', 'PRIVACY']) {
    const slug = `business-${kind.toLowerCase()}`,
      version = `${slug}-20260930-v1`;
    let source = await readFile(
      resolve(import.meta.dirname, `../docs/drafts/BUSINESS_${kind}_REVIEW.md`),
      'utf8',
    );
    source = source.slice(source.indexOf('\n## ')).trim();
    source = source
      .split(/\r?\n\r?\n/)
      .filter((p) => !p.startsWith('Review requirement:'))
      .join('\n\n');
    source = source
      .replace(
        ' Request handling must be operationally verified before this draft is published.',
        '',
      )
      .replace(
        ' This conditional summary must be supplemented with any disclosures and request or appeal methods required for the actual launch markets before publication.',
        '',
      )
      .replace('The proposed service uses', 'The service uses')
      .replace(
        ' These safeguards and the incident-response procedure must be verified in production before publication.',
        '',
      );
    if (kind === 'TERMS')
      source = source.replace(
        'The business portal is for people',
        'Business onboarding is currently available to United States businesses. The business portal is for people',
      );
    else {
      source = source.replace(
        'This does not establish where service providers store or process information.',
        'Business onboarding is currently offered to United States businesses. Our primary application database is in Oregon, United States. Our providers may process service, security and support information in other locations; this notice does not promise United States-only processing.',
      );
      source = source.replace(
        'Providers operating our support mailbox also process support correspondence.',
        'Support email is routed through Cloudflare to the operator’s Google mailbox, so these providers also process support correspondence.',
      );
      source = source.replace(
        'Verification and recovery emails are service messages, not marketing subscriptions.',
        'The onboarding site does not use advertising or cross-site behavioral tracking integrations. Do Not Track browser signals do not change the necessary account and security processing described here. You may contact support about privacy preferences or rights. Verification and recovery emails are service messages, not marketing subscriptions.',
      );
      source = source.replace(
        'Contact us to exercise applicable rights.',
        'Contact support@dojipro.com to exercise applicable rights or request review of a denied request, using “Business privacy appeal” as the subject for an appeal. We do not require you to give up applicable rights to use the service.',
      );
    }
    const blocks = source
      .split(/\n\n/)
      .map((p) =>
        p.startsWith('## ')
          ? `<h2>${inline(p.slice(3))}</h2>`
          : p.startsWith('- ')
            ? `<ul>${p
                .split('\n')
                .map((l) => `<li>${inline(l.replace(/^- /, ''))}</li>`)
                .join('')}</ul>`
            : `<p>${inline(p.replaceAll('\n', ' '))}</p>`,
      )
      .join('\n');
    const title = kind === 'TERMS' ? 'Doji Business Terms' : 'Doji Business Privacy Notice';
    const intro = `Effective September 30, 2026 · Version ${version}. Gavin Fahey, operating Doji from Eagle Mountain, Utah, United States. Contact: support@dojipro.com.`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="icon" href="/assets/doji-icon.png"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/portal.css"><link rel="stylesheet" href="/business-portal/application/application.css"><script src="/theme-init.js"></script></head><body class="portalPage"><a class="skip" href="#main">Skip to content</a><header class="onboardingHeader"><a class="portalBrand" href="/business-portal/application/"><img src="/assets/doji-icon.png" alt=""><span>Doji<small>Business</small></span></a><a class="portalButton" href="/business-portal/access/">Back to account</a></header><main id="main" class="applicationMain"><article class="onboardingCard"><h1>${title}</h1><p>${intro}</p>${blocks}<p><a href="mailto:support@dojipro.com">Contact support</a> · <a href="/business-${kind === 'TERMS' ? 'privacy' : 'terms'}/business-${kind === 'TERMS' ? 'privacy' : 'terms'}-20260930-v1/">${kind === 'TERMS' ? 'Privacy notice' : 'Business terms'}</a></p></article></main></body></html>`;
    if (/Review requirement:|proposed service|Draft/.test(html))
      throw Error('Unresolved legal editorial text');
    await mkdir(`${output}/${slug}/${version}`, { recursive: true });
    const preserved = html
      .replace('<body class="portalPage">', '<body class="portalPage"><!--email_off-->')
      .replace('</body>', '<!--/email_off--></body>');
    await writeFile(`${output}/${slug}/${version}/index.html`, preserved);
    await writeFile(`${output}/${slug}/index.html`, preserved);
  }
}
