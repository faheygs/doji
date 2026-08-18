// Compatibility export for any older call sites. Realtime transport is Ably;
// correctness after gaps comes from authoritative foreground/reconnect reads.
export { useDomainRealtime as useAppRealtime } from './useDomainRealtime';
