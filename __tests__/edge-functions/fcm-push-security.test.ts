import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/_shared/fcm-push.ts'),
  'utf8',
);

describe('FCM credential and telemetry safety', () => {
  it('validates provider credentials before constructing the FCM URL', () => {
    expect(source).toContain('GOOGLE_PROJECT_ID.test(projectId)');
    expect(source).toContain('FCM project ID is malformed');
    expect(source).toContain("const { projectId } = fcmConfig()");
  });

  it('never stores a raw FCM provider error message', () => {
    expect(source).toContain("errorCode ?? 'provider rejected request'");
    expect(source).not.toContain("payload.error?.message ?? 'rejected'");
    expect(source).toContain('safeTransportError(error)');
  });
});
