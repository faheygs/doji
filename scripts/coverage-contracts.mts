import { z } from 'zod';
import type { FileCoverageData } from 'istanbul-lib-coverage';

const count = z.number().finite().nonnegative();
// Istanbul represents an implicit else arm with {start:{}, end:{}}. Preserve
// that location rather than inventing a source line to satisfy upstream types.
const position = z.object({ line: count.optional(), column: count.optional() });
const range = z.object({ start: position, end: position });
// Preserve optional Istanbul metadata while validating the fields used by the gate.
const entry = z
  .object({
    path: z.string(),
    statementMap: z.record(z.string(), range),
    fnMap: z.record(
      z.string(),
      z.object({ name: z.string(), decl: range, loc: range, line: count }),
    ),
    branchMap: z.record(
      z.string(),
      z.object({ type: z.string(), loc: range, locations: z.array(range), line: count }),
    ),
    s: z.record(z.string(), count),
    f: z.record(z.string(), count),
    b: z.record(z.string(), z.array(count)),
  })
  .passthrough();
export function coverageEntry(value: unknown): FileCoverageData {
  // @types/istanbul-lib-coverage overstates location completeness for implicit
  // arms. This one library adapter retains the validated serialized format.
  return entry.parse(value) as FileCoverageData;
}
export function coverageData(value: unknown): Record<string, FileCoverageData> {
  return Object.fromEntries(
    Object.entries(z.record(z.string(), z.unknown()).parse(value)).map(([file, data]) => [
      file,
      coverageEntry(data),
    ]),
  );
}
