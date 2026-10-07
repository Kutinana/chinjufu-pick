import { describe, expect, it } from 'vitest';
import { pageForPath, PICKUP_PATHS } from './routes';

describe('independent pickup routes', () => {
  it('distinguishes the homepage and the two pickup pages', () => {
    expect(pageForPath('/')).toBe('home');
    expect(pageForPath(PICKUP_PATHS.types)).toBe('types');
    expect(pageForPath(PICKUP_PATHS['dd-classes'])).toBe('dd-classes');
    expect(pageForPath('/favorite-destroyers/')).toBe('dd-classes');
    expect(pageForPath('/unknown')).toBe('not-found');
  });
});
