export function criteriaLabel(type: string, value: number): string {
  switch (type) {
    case 'first_doji_wins':
      return `Be first overall to Doji ${value} time${value === 1 ? '' : 's'}`;
    case 'streak_days':
      return `Reach a ${value}-day streak`;
    case 'completions':
      return `Complete ${value} challenge${value === 1 ? '' : 's'}`;
    case 'total_xp':
      return `Earn ${value.toLocaleString()} total XP`;
    case 'reactions_given':
      return `Give ${value} reaction${value === 1 ? '' : 's'}`;
    case 'reactions_received':
      return `Receive ${value} reaction${value === 1 ? '' : 's'}`;
    case 'poll_votes':
      return `Vote in ${value} poll${value === 1 ? '' : 's'}`;
    case 'friends_count':
      return `Have ${value} friend${value === 1 ? '' : 's'}`;
    case 'level_reached':
      return `Reach level ${value}`;
    case 'ideas_submitted':
      return `Submit ${value} challenge idea${value === 1 ? '' : 's'}`;
    case 'ideas_picked':
      return `Have ${value} idea${value === 1 ? '' : 's'} picked for a daily challenge`;
    default:
      return `Reach ${value}`;
  }
}
