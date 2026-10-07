import { describe, expect, it } from 'vitest';
import { clampSquare, cleanAvatarAdjustment, defaultSquare, resolveAvatarCrop, zoomSquare } from './avatar';
import { candidatesFor, cleanArtworkBoard, cleanBoard, decodeBoard, encodeBoard } from './model';
import type { Artwork, AvatarAdjustment, AvatarCrop, ShipData } from './model';
import { readFileSync } from 'node:fs';

const base: AvatarCrop = { size: [600, 1000], rect: [180, 80, 200, 200], method: 'detected', score: 1 };
const custom: AvatarAdjustment = { image: '/artworks/test.webp', size: [600, 1000], rect: [220, 120, 100, 100] };

describe('avatar positioning', () => {
  it('uses the supplied face position, or a centered square for an uncatalogued portrait', () => {
    expect(defaultSquare(base.size, base.rect)).toEqual(base.rect);
    expect(defaultSquare([200, 300])).toEqual([0, 50, 200, 200]);
  });
  it('zooms around the existing center and clamps dragging to the image bounds', () => {
    expect(zoomSquare(base.size, base.rect!, 100)).toEqual([230, 130, 100, 100]);
    expect(clampSquare(base.size, [-50, 950, 200, 200])).toEqual([0, 800, 200, 200]);
    expect(zoomSquare(base.size, base.rect!, 2000)).toEqual([0, 0, 600, 600]);
  });
  it('ignores coordinates for another image or a replaced image of different dimensions', () => {
    expect(resolveAvatarCrop(custom.image, base, custom)?.rect).toEqual(custom.rect);
    expect(resolveAvatarCrop('/artworks/other.webp', base, custom)).toBe(base);
    expect(resolveAvatarCrop(custom.image, { ...base, size: [500, 900] }, custom)?.method).toBe('detected');
  });
  it('rejects unsafe URLs, nonfinite numbers, inverted rectangles, and out-of-bounds crops', () => {
    expect(cleanAvatarAdjustment(custom)).toEqual(custom);
    for (const bad of [null, { ...custom, image: 'https://example.com/x.webp' }, { ...custom, size: [0, 1000] },
      { ...custom, rect: [NaN, 0, 100, 100] }, { ...custom, rect: [-1, 0, 100, 100] },
      { ...custom, rect: [550, 0, 100, 100] }, { ...custom, rect: [0, 0, -100, -100] },
      { ...custom, rect: [0, 0, 100, 200] }, { ...custom, rect: [0, 0, Infinity, Infinity] }]) {
      expect(cleanAvatarAdjustment(bad)).toBeUndefined();
    }
  });
});

describe('saved and shared avatar positions', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/ships.json', import.meta.url), 'utf8')) as ShipData;
  const shimakaze = candidatesFor(data.ships).find((candidate) => candidate.ship.names.en === 'Shimakaze')!;
  const art: Artwork = { id: 'test-art', shipId: shimakaze.ship.id, variantId: shimakaze.ship.id, image: custom.image,
    names: shimakaze.ship.names, kind: 'standard', damage: 'normal', source: '' };
  const pick = { shipId: shimakaze.ship.id, variantId: shimakaze.ship.id, artworkId: art.id, avatar: custom };
  it.each(['DD', 'DD:22'] as const)('round-trips adjustment coordinates for %s and validates the image binding', (slot) => {
    const board = { version: 1 as const, nickname: '提督⚓', picks: { [slot]: pick } };
    expect(decodeBoard(encodeBoard(board), data.ships)).toEqual(board);
    expect(cleanArtworkBoard(board, [art]).picks[slot]?.avatar).toEqual(custom);
    expect(cleanArtworkBoard(board, [{ ...art, image: '/artworks/replaced.webp' }]).picks[slot]?.avatar).toBeUndefined();
    expect(cleanArtworkBoard(board, []).picks[slot]?.avatar).toBeUndefined();
    expect(cleanBoard({ ...board, picks: { [slot]: { ...pick, avatar: { ...custom, rect: [-1, 0, 100, 100] } } } }, data.ships).picks[slot]).toEqual({ shipId: pick.shipId, variantId: pick.variantId, artworkId: art.id });
  });
  it('keeps portrait adjustments for an old selection without an artwork ID', () => {
    const portrait = { ...custom, image: shimakaze.ship.image };
    const board = { version: 1 as const, nickname: '', picks: { DD: { shipId: pick.shipId, variantId: pick.variantId, avatar: portrait } } };
    expect(cleanArtworkBoard(cleanBoard(board, data.ships), []).picks.DD?.avatar).toEqual(portrait);
  });
});
