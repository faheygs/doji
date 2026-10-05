export interface SafetyConfig { enabled?: boolean; preview?: boolean; endpoint?: string; siteKey?: string }
export interface SafetyCategory {
  value: string; label: string; targets?: string[];
  details: { value: string; label: string; restricted: boolean }[];
}
declare global {
  interface Window {
    DOJI_SAFETY_CONFIG?: SafetyConfig;
    DojiReportTaxonomy?: SafetyCategory[];
  }
}
