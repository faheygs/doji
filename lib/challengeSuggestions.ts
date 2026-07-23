import type { Challenge } from '../types/database';

export function mapSuggestionKindToChallengeRow(kind: string): {
  type: Challenge['type'];
  category: Challenge['category'];
  requires_photo: boolean;
  requires_video: boolean;
  requires_text: boolean;
} {
  switch (kind) {
    case 'poll':
    case 'wyr':
      return { type: 'poll', category: 'social', requires_photo: false, requires_video: false, requires_text: false };
    case 'question':
      return { type: 'task', category: 'mental', requires_photo: false, requires_video: false, requires_text: true };
    case 'format_question':
      return { type: 'format', category: 'mental', requires_photo: false, requires_video: false, requires_text: true };
    case 'photo_idea':
      return { type: 'photo', category: 'creative', requires_photo: true, requires_video: false, requires_text: false };
    default:
      return { type: 'task', category: 'mental', requires_photo: false, requires_video: false, requires_text: true };
  }
}
