// Narrow declaration for the installed 5.2.1 public API used here, verified
// against src/index.js and src/instrumenter.js. No wildcard/any module shim.
declare module 'istanbul-lib-instrument' {
  import type { FileCoverageData } from 'istanbul-lib-coverage';
  export function createInstrumenter(options: {
    esModules?: boolean;
    compact?: boolean;
    coverageVariable?: string;
    produceSourceMap?: boolean;
    coverageGlobalScope?: string;
    coverageGlobalScopeFunc?: boolean;
  }): {
    instrumentSync(source: string, filename: string): string;
    lastFileCoverage(): FileCoverageData | null | undefined;
  };
}
