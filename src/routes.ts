import type { BoardMode } from './model';

export const PICKUP_PATHS: Record<BoardMode, string> = {
  types: '/favorite-shipgirls',
  'dd-classes': '/favorite-destroyers',
};
export type Page = 'home' | BoardMode | 'not-found';
export function pageForPath(path: string): Page {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/') return 'home';
  return (Object.entries(PICKUP_PATHS).find(([, value]) => value === normalized)?.[0] as BoardMode | undefined) ?? 'not-found';
}
