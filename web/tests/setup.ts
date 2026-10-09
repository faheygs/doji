import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);

// jsdom has no layout engine; real observer/selection behavior is covered in Playwright.
if (!globalThis.ResizeObserver)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
if (typeof document !== 'undefined' && !document.elementFromPoint)
  document.elementFromPoint = () => null;
