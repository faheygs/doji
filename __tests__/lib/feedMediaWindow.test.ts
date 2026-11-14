import { feedMediaWindow } from '../../lib/feedMediaWindow';
import type { Post } from '../../types/database';
const posts = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }) as Post);
test('primes two cards, then only visible cards and two ahead', () => {
  expect([...feedMediaWindow(posts, new Set())]).toEqual(['0', '1']);
  expect([...feedMediaWindow(posts, new Set(['5', '6']))]).toEqual(['5', '6', '7', '8']);
  expect([...feedMediaWindow(posts, new Set(['19']))]).toEqual(['19']);
  expect([...feedMediaWindow([], new Set(['old']))]).toEqual([]);
});
