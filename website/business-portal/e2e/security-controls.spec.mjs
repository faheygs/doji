import { test, expect } from '../../coverage-fixture.mjs';

async function blank(page) {
  await page.route('**/business-portal/security-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main><div id="mfa" hidden></div><div id="verification" hidden></div></main>',
    }),
  );
  await page.goto('/business-portal/security-fixture');
}
async function mfa(page, options = {}) {
  await blank(page);
  await page.evaluate(async (options) => {
    const { createBusinessMfa } = await import('/business-portal/business-mfa.js');
    window.fixture = { errors: [], calls: [], verified: 0, cancelled: 0, epoch: 0 };
    const f = window.fixture;
    f.client = {
      onClear: (fn) => {
        f.lock = () => {
          f.epoch++;
          fn();
        };
      },
      epoch: () => f.epoch,
      factors: async () => {
        f.calls.push('factors');
        if (options.pendingFactors)
          return new Promise((r) => {
            f.releaseFactors = r;
          });
        if (options.factorError) throw Error('Factors unavailable');
        return options.existing ? [{ id: 'existing-factor', status: 'verified' }] : [];
      },
      enroll: async () => {
        f.calls.push('enroll');
        return (
          options.enrollment ?? {
            id: 'new-factor',
            totp: { secret: 'SYNTHETIC', qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
          }
        );
      },
      verifyFactor: async (id, code) => {
        f.calls.push({ id, code });
        if (options.pendingVerify)
          return new Promise((resolve, reject) => {
            f.releaseVerify = resolve;
            f.rejectVerify = reject;
          });
        if (options.verifyError) throw Error('Code rejected');
      },
    };
    f.ui = createBusinessMfa(
      document.querySelector('#mfa'),
      f.client,
      async () => {
        f.verified++;
        if (options.afterError) {
          if (options.afterLock) f.lock();
          throw Error('Workspace unavailable');
        }
      },
      (message) => f.errors.push(message),
      () => {
        f.cancelled++;
      },
    );
    f.open = f.ui.open(options.noEnroll ? { enroll: false } : undefined).catch((error) => {
      f.openError = error.message;
    });
  }, options);
}

test('business MFA cancellation removes private setup material without calling verification', async ({
  page,
}) => {
  await mfa(page);
  await expect(page.locator('#mfa img')).toBeVisible();
  await page.locator('#businessMfaCode').fill('123456');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#mfa')).toBeHidden();
  await expect(page.locator('#mfa img')).not.toHaveAttribute('src');
  await expect(page.locator('[data-mfa-secret]')).toBeEmpty();
  expect(await page.evaluate(() => window.fixture.cancelled)).toBe(1);
  expect(await page.evaluate(() => window.fixture.calls)).toEqual(['factors', 'enroll']);
});
test('existing-factor check can decline enrollment without a new secret', async ({ page }) => {
  await mfa(page, { noEnroll: true });
  await page.evaluate(() => window.fixture.open);
  await expect(page.locator('#mfa')).toBeHidden();
  expect(await page.evaluate(() => window.fixture.calls)).toEqual(['factors']);
  await page.locator('#mfa form').dispatchEvent('submit');
  expect(await page.evaluate(() => window.fixture.verified)).toBe(0);
});
for (const enrollment of [
  {},
  { id: 'f', totp: { secret: 4, qr_code: '<svg/>' } },
  { id: 'f', totp: { secret: 'SYNTHETIC', qr_code: 4 } },
  { id: 'f', totp: { secret: 'SYNTHETIC', qr_code: 'https://untrusted.example.test/image' } },
])
  test(`invalid MFA setup fails closed ${JSON.stringify(enrollment)}`, async ({ page }) => {
    await mfa(page, { enrollment });
    await page.evaluate(() => window.fixture.open);
    await expect(page.locator('#mfa')).toBeHidden();
    expect(await page.evaluate(() => window.fixture.errors.length)).toBe(1);
    await expect(page.locator('[data-mfa-secret]')).toBeEmpty();
  });
test('data SVG enrollment stays an image, never active markup', async ({ page }) => {
  await mfa(page, {
    enrollment: {
      id: 'f',
      totp: {
        secret: '<script>synthetic</script>',
        qr_code: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
      },
    },
  });
  await expect(page.locator('#mfa form')).toBeVisible();
  await expect(page.locator('[data-mfa-secret]')).toHaveText('<script>synthetic</script>');
  await expect(page.locator('#mfa script')).toHaveCount(0);
});
test('late factor lookup cannot reopen MFA after session clear', async ({ page }) => {
  await mfa(page, { pendingFactors: true });
  await page.evaluate(async () => {
    const f = window.fixture;
    f.lock();
    f.releaseFactors([]);
    await f.open;
  });
  await expect(page.locator('#mfa')).toBeHidden();
  expect(await page.evaluate(() => window.fixture.calls)).toEqual(['factors']);
});
for (const reject of [true, false])
  test(`pending MFA ${reject ? 'failure' : 'success'} after lock is ignored`, async ({ page }) => {
    await mfa(page, { existing: true, pendingVerify: true });
    await expect(page.locator('#mfa form')).toBeVisible();
    await page.locator('#businessMfaCode').fill('123456');
    await page.locator('#mfa form').dispatchEvent('submit');
    await page.locator('#mfa form').dispatchEvent('submit');
    await page.evaluate(async (reject) => {
      const f = window.fixture;
      f.lock();
      if (reject) f.rejectVerify(Error('late'));
      else f.releaseVerify();
      await Promise.resolve();
    }, reject);
    await expect(page.locator('#mfa')).toBeHidden();
    expect(await page.evaluate(() => window.fixture.errors)).toEqual([]);
    expect(await page.evaluate(() => window.fixture.verified)).toBe(0);
    expect(
      await page.evaluate(() => window.fixture.calls.filter((call) => typeof call === 'object')),
    ).toEqual([{ id: 'existing-factor', code: '123456' }]);
  });
for (const afterLock of [true, false])
  test(`post-MFA workspace failure respects changed session=${afterLock}`, async ({ page }) => {
    await mfa(page, { existing: true, afterError: true, afterLock });
    await expect(page.locator('#mfa form')).toBeVisible();
    await page.locator('#businessMfaCode').fill('123456');
    await page.locator('#mfa form').dispatchEvent('submit');
    await expect(page.locator('#mfa')).toBeHidden();
    expect(await page.evaluate(() => window.fixture.verified)).toBe(1);
    expect(await page.evaluate(() => window.fixture.errors)).toEqual(
      afterLock ? [] : ['Workspace unavailable'],
    );
  });

async function verification(page, mode) {
  await blank(page);
  if (mode === 'timeout') await page.clock.install();
  await page.route('https://challenges.cloudflare.com/**', (route) => {
    if (mode === 'error') return route.abort();
    if (mode === 'timeout')
      return route.fulfill({
        contentType: 'application/javascript',
        body: '/* synthetic no SDK */',
      });
    return route.fulfill({
      contentType: 'application/javascript',
      body:
        mode === 'missing'
          ? '/* loaded without SDK */'
          : `window.widgets=[];window.removed=[];window.turnstile={render:(_node, options)=>{window.widgets.push(options);return window.widgets.length;},remove:id=>window.removed.push(id)};`,
    });
  });
  await page.evaluate(async (mode) => {
    const { createBusinessVerification } =
      await import('/business-portal/business-verification.js');
    window.verification = createBusinessVerification(
      document.querySelector('#verification'),
      {
        publicAdmission: mode !== 'disabled',
        turnstileSiteKey: mode === 'no-key' ? '' : 'synthetic',
      },
      'signup',
    );
  }, mode);
}
test('disabled business verification has no challenge or proof requirement', async ({ page }) => {
  await verification(page, 'disabled');
  expect(
    await page.evaluate(() => {
      const v = window.verification;
      v.reset();
      v.pause();
      v.clear();
      return v.fields();
    }),
  ).toEqual({});
  await expect(page.locator('#verification')).toBeHidden();
});
for (const mode of ['error', 'missing', 'no-key'])
  test(`business CAPTCHA ${mode} exposes an explicit retry and never manufactures proof`, async ({
    page,
  }) => {
    await verification(page, mode);
    await expect(page.getByRole('button', { name: 'Retry security check' })).toBeVisible();
    expect(
      await page.evaluate(() => {
        try {
          window.verification.fields();
          return 'unexpected';
        } catch (error) {
          return error.message;
        }
      }),
    ).toContain('Complete the security check');
  });
test('business verification consumes proof once, retries explicitly, and ignores cleared widget callbacks', async ({
  page,
}) => {
  await verification(page, 'ok');
  await expect(page.locator('[data-business-challenge-status]')).toHaveText(
    'Complete the security check before continuing.',
  );
  expect(
    await page.evaluate(() => {
      window.widgets[0].callback('proof');
      return window.verification.fields();
    }),
  ).toEqual({ verificationToken: 'proof' });
  expect(
    await page.evaluate(() => {
      try {
        window.verification.fields();
        return 'unexpected';
      } catch (error) {
        return error.message;
      }
    }),
  ).toContain('Complete the security check');
  await page.evaluate(() => window.widgets[0]['expired-callback']());
  await page.getByRole('button', { name: 'Retry security check' }).click();
  await expect.poll(() => page.evaluate(() => window.widgets.length)).toBe(2);
  await page.evaluate(async () => {
    window.verification.pause();
    window.widgets[1].callback('obsolete');
    window.widgets[1]['error-callback']();
    await window.verification.reset('recovery');
  });
  expect(await page.evaluate(() => window.widgets[2].action)).toBe('business_recovery');
  await page.evaluate(async () => {
    window.verification.clear();
    window.widgets[2].callback('obsolete');
    window.widgets[2]['timeout-callback']();
    await window.verification.reset();
  });
  expect(await page.evaluate(() => window.widgets.length)).toBe(3);
  expect(
    await page.evaluate(() => {
      try {
        window.verification.fields();
        return 'unexpected';
      } catch (error) {
        return error.message;
      }
    }),
  ).toContain('Complete the security check');
});

for (const mode of ['success', 'missing', 'error', 'timeout']) {
  test(`realtime SDK loader ${mode} is bounded, shared and recoverable`, async ({ page }) => {
    await blank(page);
    await page.clock.install();
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route('https://cdn.ably.com/**', async (route) => {
      requests++;
      if (mode === 'timeout' && requests === 1) await held;
      if (mode === 'error' && requests === 1) return route.abort();
      return route.fulfill({
        contentType: 'application/javascript',
        body:
          mode === 'missing' && requests === 1
            ? '/* no SDK */'
            : 'window.Ably={Realtime:class SyntheticRealtime {}};',
      });
    });
    await page.evaluate(async () => {
      const { loadBusinessRealtimeSdk } = await import('/business-portal/business-realtime.js');
      window.loadRealtime = loadBusinessRealtimeSdk;
      const first = loadBusinessRealtimeSdk(),
        second = loadBusinessRealtimeSdk();
      window.sharedSdkTask = first === second;
      window.sdkResult = first.then(
        () => 'ready',
        (error) => error.message,
      );
    });
    if (mode === 'timeout') {
      await expect.poll(() => requests).toBe(1);
      await page.clock.fastForward(12001);
    }
    const result = await page.evaluate(() => window.sdkResult);
    expect(await page.evaluate(() => window.sharedSdkTask)).toBe(true);
    expect(requests).toBe(1);
    if (mode === 'success') {
      expect(result).toBe('ready');
      expect(await page.evaluate(async () => (await window.loadRealtime()) === window.Ably)).toBe(
        true,
      );
      expect(requests).toBe(1);
    } else {
      expect(result).toBe(mode === 'timeout' ? 'SDK deadline' : 'SDK unavailable');
      await expect(page.locator('script[src*="cdn.ably.com"]')).toHaveCount(0);
      if (mode === 'timeout') release();
      else {
        expect(await page.evaluate(async () => (await window.loadRealtime()) === window.Ably)).toBe(
          true,
        );
        expect(requests).toBe(2);
      }
    }
  });
}
