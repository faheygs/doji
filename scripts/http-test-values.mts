// Test-only view of fetch requests. Reject unexpected body/headers shapes rather
// than casting a Fetch API union to whichever fixture a test expects.
import assert from 'node:assert/strict';
export function capturedRequest(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  assert.ok(init, 'Expected explicit request options');
  assert.equal(typeof init.body, 'string', 'Expected JSON request body');
  return {
    url: input instanceof Request ? input.url : String(input),
    init: { ...init, body: init.body as string, headers: Object.fromEntries(new Headers(init.headers)) },
  };
}
