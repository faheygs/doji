/** Compact display for counts (e.g. comment totals): 0–999 as-is, then 1k, 1.2k, 10.5k, 999k, 1.1m. */
export function formatCompactCount(n: number): string {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x < 1000) return String(x);
  if (x < 1_000_000) {
    const thousands = x / 1000;
    if (thousands < 100) {
      const rounded = Math.round(thousands * 10) / 10;
      const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
      return `${s}k`;
    }
    return `${Math.floor(thousands)}k`;
  }
  const mil = x / 1_000_000;
  if (mil < 10) {
    const rounded = Math.round(mil * 10) / 10;
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
    return `${s}m`;
  }
  return `${Math.round(mil)}m`;
}
