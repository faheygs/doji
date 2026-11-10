// Release gate: enable only after the separately approved v2 SQL/index rollout
// and native anchor qualification. Never silently fall back to unbounded reads.
export const COMMENT_PAGING_V2_ENABLED: boolean = false;
