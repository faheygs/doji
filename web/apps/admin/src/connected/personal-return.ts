export function personalReturn(params: URLSearchParams, area?: string) {
  // Audit case links reuse the my-work record route; their explicit origin wins.
  if (params.has('from') && params.get('from') !== 'my-work') return null;
  if (area !== 'my-work' && params.get('from') !== 'my-work') return null;
  const state = params.get('workState');
  return '/my-work' + (state === 'completed' || state === 'all' ? '?state=' + state : '');
}
