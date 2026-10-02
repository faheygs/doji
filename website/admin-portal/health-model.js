/* Portal presentation only: never changes delivery, paging, or member authorization. */
(function (root) {
  const labels = { healthy: 'Healthy', watch: 'Watch', degraded: 'Degraded', critical: 'Critical', unknown: 'Needs verification' };
  const rank = { healthy: 0, unknown: 1, watch: 2, degraded: 3, critical: 4 };
  const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const worst = (states) => states.reduce((a, b) => rank[b] > rank[a] ? b : a, 'healthy');
  const signal = (name, state, detail) => ({ name, state, label: labels[state], detail });
  function latency(p95, max, samples, slow) {
    if (max > 30000) return 'critical';
    if (samples >= 20 && p95 > 5000) return 'degraded';
    if (p95 >= 1000 || max > 5000 || slow > 0) return 'watch';
    if ([p95, max, samples, slow].some((v) => v === null) || samples < 20) return 'unknown';
    return 'healthy';
  }
  function eventState(e) {
    const delivery = latency(number(e.realtime_p95_ms), number(e.realtime_max_ms), number(e.realtime_sample_count), number(e.realtime_over_5s));
    if ([e.outbox_exhausted, e.push_shards_exhausted, e.push_shards_expired].some((v) => number(v) > 0)) return 'critical';
    if (number(e.outbox_unpublished) > 0 || e.healthy === false) return worst([delivery, 'degraded']);
    return worst([delivery, e.healthy === true ? 'healthy' : 'unknown']);
  }
  function evaluate({ operational = {}, sentry = {}, history = [], failed = false, historyFailed = false, generatedAt, now = Date.now() } = {}) {
    const checked = Date.parse(operational.checked_at || '');
    const stale = failed || operational.available === false || !Number.isFinite(checked) || now - checked > 180000 || checked > now + 60000;
    const p95 = number(operational.realtime_p95_ms_5m), max = number(operational.realtime_max_ms_5m);
    const samples = number(operational.realtime_sample_count_5m), slow = number(operational.realtime_over_5s_5m);
    const signals = [signal('Realtime delivery · last 5 minutes', stale ? 'unknown' : latency(p95, max, samples, slow), stale
      ? 'Health read unavailable or older than 3 minutes. Refresh before relying on these values.'
      : `p95 ${p95 ?? '—'} ms · max ${max ?? '—'} ms · ${samples ?? '—'} samples · ${slow ?? '—'} over 5s. Fewer than 20 samples cannot establish healthy latency.`)];
    if (signals[0].state === 'unknown') {
      signals[0].label = stale ? 'Refresh needed' : samples === 0 ? 'No recent traffic' : samples === null ? 'Telemetry missing' : 'Limited sample';
      signals[0].detail = stale ? 'The delivery reading is missing or more than 3 minutes old. Refresh health; if it still fails, investigate the monitoring connection.'
        : samples === 0 ? 'No delivery events were measured in the last 5 minutes. Latency cannot be assessed; review the latest Doji summary below.'
        : samples === null ? 'The monitoring response did not include an event count. Refresh health to retry.'
        : `${samples} events measured; at least 20 are needed for a reliable latency assessment. Review the latest Doji summary below.`;
    }
    for (const [name, activeKey, terminalKey] of [['Realtime outbox', 'outbox_overdue', 'outbox_exhausted'], ['Push fanout', 'push_stale_shards', 'push_exhausted_shards']]) {
      const active = number(operational[activeKey]), terminal = number(operational[terminalKey]);
      const state = stale ? 'unknown' : terminal > 0 ? 'critical' : active > 0 ? 'degraded' : active === null || terminal === null ? 'unknown' : 'healthy';
      signals.push(signal(name, state, `${active ?? '—'} ${activeKey === 'outbox_overdue' ? 'overdue events' : 'stale shards'} · ${terminal ?? '—'} exhausted. Any backlog needs review; exhausted work is critical.`));
      if (state === 'unknown') { signals.at(-1).label = stale ? 'Refresh needed' : 'Telemetry missing'; signals.at(-1).detail = 'Current backlog counts could not be verified. Refresh health before relying on this signal.'; }
    }
    const credentials = number(operational.apns_provider_credential_errors);
    signals.push(signal('APNs provider credentials', stale || credentials === null ? 'unknown' : credentials > 0 ? 'critical' : 'healthy', `${credentials ?? '—'} credential failures. This does not verify that a phone displayed a notification.`));
    if (signals.at(-1).state === 'unknown') { signals.at(-1).label = stale ? 'Refresh needed' : 'Telemetry missing'; signals.at(-1).detail = 'The latest credential-failure count is unavailable. Refresh health to retry.'; }
    if (!stale && operational.healthy === false) signals.push(signal('Server health guardrail', 'degraded', 'The server reports unhealthy delivery; an empty backlog does not override this.'));
    const delivery = worst(signals.map((s) => s.state));
    const issues = Array.isArray(sentry.issues) ? sentry.issues : [];
    const snapshotTime = Date.parse(generatedAt || operational.checked_at || '');
    const available = !failed && Number.isFinite(snapshotTime) && now - snapshotTime <= 180000 && snapshotTime <= now + 60000 && sentry.configured === true && sentry.available === true;
    const app = signal('App errors · Sentry last 24 hours', !available ? 'unknown' : issues.length ? 'degraded' : 'healthy', !available
      ? 'Sentry coverage is unavailable. Missing errors are not proof that the app is healthy.'
      : issues.length ? `${issues.length}${issues.length >= 25 ? '+' : ''} unresolved issue groups returned. Review crashes, account, comments, and timeout errors below; this is not a live outage count.`
      : 'No unresolved issues returned by the bounded production query. Resolved issues, unreported failures, and feature success rates are not covered.');
    if (!available) {
      app.label = sentry.configured === false ? 'Not connected' : [401,403].includes(sentry.upstream_status) ? 'Access denied' : 'Feed unavailable';
      app.detail = sentry.configured === false ? 'Sentry is not configured for this portal. An operator must connect read-only Sentry access before app errors can be reviewed here.'
        : [401,403].includes(sentry.upstream_status) ? 'Sentry rejected the monitoring credentials. Check the read-only token and project access; refreshing alone may not fix this.'
        : `App-error monitoring could not be refreshed${sentry.upstream_status ? ` (HTTP ${sentry.upstream_status})` : ''}. Refresh health, then check the Sentry connection if it persists. App errors are not currently verified.`;
    }
    const recent = history.filter((e) => {
      const end = Date.parse(e.observed_through || e.closes_at || e.fires_at || '');
      return Number.isFinite(end) && end >= now - 86400000 && end <= now;
    });
    const incidents = recent.filter((e) => ['watch', 'degraded', 'critical'].includes(eventState(e)));
    const incomplete = historyFailed || !recent.length || recent.some((e) => !e.finalized_at || eventState(e) === 'unknown');
    const past = signal('Recent Doji delivery · last 24 hours', incidents.length ? 'watch' : incomplete ? 'unknown' : 'healthy', incidents.length
      ? `${incidents.length} Doji summaries have delivery problems or missed targets. Current recovery does not erase these results.${historyFailed ? ' History refresh failed; retained summaries may be stale.' : ''}`
      : incomplete ? 'Event coverage is missing, low-sample, or still settling. This is not an all-clear for today.' : 'Available finalized event summaries meet the displayed delivery targets. They do not measure every app request.');
    if (past.state === 'unknown') past.label = historyFailed ? 'History unavailable' : !recent.length ? 'No recent summary' : recent.some((e) => !e.finalized_at) ? 'Still settling' : 'Limited sample';
    const state = worst([delivery, app.state, past.state]);
    return { state, label: labels[state], delivery, signals: [...signals, app, past], incidents: incidents.length, stale,
      title: state === 'healthy' ? 'Measured signals within target' : state === 'unknown' ? 'Health coverage incomplete' : `${labels[state]} — review the affected signals`,
      summary: `Delivery: ${labels[delivery]} · App errors: ${app.label} · Recent Dojis: ${past.label}` };
  }
  const reviewClosed = (item) => ['resolved', 'approved', 'draft', 'dismissed', 'action_taken', 'reversed'].includes(item.status);
  const reviewSevere = (item) => ['critical', 'high'].includes(item.priority) || ['level_2', 'level_3'].includes(item.severity);
  function reviewDeadline(item, now = Date.now()) {
    const at = Date.parse(item.deadlineAt || item.deadline_at || '');
    if (reviewClosed(item)) return { state: 'closed', at };
    if (!Number.isFinite(at)) return { state: 'unknown', at };
    const remaining = at - now;
    return { at, remaining, state: remaining <= 0 ? reviewSevere(item) ? 'critical' : 'overdue' : remaining <= 4 * 3600000 ? 'watch' : 'healthy' };
  }
  function reviewQueue(items, total, now = Date.now()) {
    const active = [...new Map(items.filter((item) => !reviewClosed(item)).map((item) => [item.id, item])).values()];
    const states = active.map((item) => reviewDeadline(item, now));
    const complete = Number.isInteger(total) && total >= 0 && active.length === total;
    const overdue = states.filter((s) => ['overdue', 'critical'].includes(s.state));
    const critical = overdue.filter((s) => s.state === 'critical').length;
    const nearing = states.filter((s) => s.state === 'watch').length;
    const unknown = states.filter((s) => s.state === 'unknown').length;
    const prefix = complete ? '' : 'At least ';
    let state = 'unknown', note;
    if (overdue.length) {
      state = critical ? 'critical' : 'overdue';
      const minutes = Math.max(1, Math.floor((now - Math.min(...overdue.map((s) => s.at))) / 60000));
      const age = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
      note = `${prefix}${overdue.length} overdue${critical ? ` · ${critical} high-risk — urgent review` : ''} · Oldest ${age} past target${nearing ? ` · ${nearing} due within 4h` : ''}`;
    } else if (nearing) {
      state = 'watch'; note = `${prefix}${nearing} due within 4h`;
    } else if (complete && !active.length) {
      state = 'empty'; note = 'No open reports';
    } else if (complete && !unknown) {
      state = active.some(reviewSevere) ? 'watch' : 'healthy';
      note = state === 'watch' ? 'High-priority review · Within target' : 'All open reports within target';
    } else note = 'Deadline coverage incomplete';
    if (!complete || unknown) note += ` · ${active.length} loaded${Number.isInteger(total) ? ` of ${total}` : ''}${unknown ? `; ${unknown} missing deadlines` : ''} · Review work queue`;
    return { state, note, overdue: overdue.length, critical, nearing, complete: complete && !unknown };
  }
  const api = { evaluate, eventState, labels, reviewDeadline, reviewQueue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojiPortalHealth = Object.freeze(api);
})(globalThis);
