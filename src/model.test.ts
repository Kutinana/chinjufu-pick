import { CLASS_ORDER } from './class-order';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GROUPS,
  SHIP_TYPES,
  DEFAULT_LAYOUT_COLUMNS,
  MAX_LAYOUT_COLUMNS,
  arrangedBoardSlots,
  boardForMode,
  boardSlots,
  slotFor,
  matchesSlot,
  groupFor,
  candidatesFor,
  candidatesByClass,
  cleanArtworkBoard,
  cleanBoard,
  cleanBoardLayout,
  decodeBoard,
  encodeBoard,
  matchesSearch,
  sortArtworks,
  shipDisplayName,
  shipClassOrdinal,
} from './model';
import type { Artwork, SavedBoard, Ship, ShipData } from './model';

const kitakami: Ship = {
  id: '19',
  names: { zh: '北上', ja: '北上', en: 'Kitakami' },
  className: { zh: '球磨型', ja: '球磨型', en: 'Kuma Class' },
  typeId: 'CL',
  image: '/ships/19.png',
  variants: [
    { id: '51', names: { zh: '北上改', ja: '北上改', en: 'Kitakami Kai' }, typeId: 'CLT', image: '/ships/51.png' },
    { id: '95', names: { zh: '北上改二', ja: '北上改二', en: 'Kitakami Kai Ni' }, typeId: 'CLT', image: '/ships/95.png' },
    // A repeated form can arise when merging two external catalogs.
    { id: '51', names: { zh: '北上改', ja: '北上改', en: 'Kitakami Kai' }, typeId: 'CLT', image: '/ships/51.png' },
  ],
};
const mogami: Ship = {
  id: '70',
  names: { zh: '最上', ja: '最上', en: 'Mogami' },
  typeId: 'CA',
  image: '/ships/70.png',
  variants: [{ id: '73', names: { zh: '最上改', ja: '最上改', en: 'Mogami Kai' }, typeId: 'CAV', image: '/ships/73.png' }],
};
const ships = [kitakami, mogami];
const data = JSON.parse(readFileSync(new URL('../public/data/ships.json', import.meta.url), 'utf8')) as ShipData;

describe('selected ship names', () => {
  it('lets renamed ships use their original identity independently of the remodel', () => {
    for (const [shipId, variantId] of [['35', '147'], ['431', '436']]) {
      const ship = data.ships.find((item) => item.id === shipId)!;
      const variant = ship.variants!.find((item) => item.id === variantId)!;
      for (const language of ['zh', 'ja', 'en'] as const) expect(shipDisplayName(ship, variant, language, true)).toBe(ship.names[language]);
      const key = shipId === '35' ? 'DD:5' : 'SS';
      const board: SavedBoard = { version: 1, nickname: '', picks: { [key]: { shipId, variantId, useOriginalName: true } } };
      expect(decodeBoard(encodeBoard(board), data.ships)).toEqual(board);
    }
  });

  it('ignores invalid original-name preferences from shared data', () => {
    expect(cleanBoard({ picks: { 'DD:5': { shipId: '35', variantId: '147', useOriginalName: 'true' } } }, data.ships).picks['DD:5']?.useOriginalName).toBeUndefined();
  });
  it.each([
    ['431', '436', ['吕500', '呂500', 'Ro-500']],
    ['35', '147', ['信赖', 'Верный', 'Verniy']],
    ['20', '651', ['丹阳', '丹陽', 'Tan Yang']],
    ['20', '656', ['雪风', '雪風', 'Yukikaze']],
    ['184', '888', ['龙凤', '龍鳳', 'Ryuuhou']],
    ['521', '529', ['大鹰', '大鷹', 'Taiyou']],
    ['522', '889', ['云鹰', '雲鷹', 'Unyou']],
    ['535', '539', ['UIT-25', 'UIT-25', 'UIT-25']],
    ['535', '530', ['伊504', '伊504', 'I-504']],
    ['511', '512', ['十月革命', 'Октябрьская революция', 'Oktyabrskaya Revolyutsiya']],
    ['988', '1002', ['野埼', '野埼', 'Nosaki']],
  ])('uses the selected identity for %s / %s in all languages', (shipId, variantId, expected) => {
    const ship = data.ships.find((item) => item.id === shipId)!;
    const variant = [ship, ...(ship.variants ?? [])].find((item) => item.id === variantId)!;
    expect((['zh', 'ja', 'en'] as const).map((language) => shipDisplayName(ship, variant, language))).toEqual(expected);
  });

  it.each(['Kitakami', 'Bismarck', 'Saratoga', 'Chitose', 'Gotland', 'Souya (ASU)', 'Glorious (BC)'])('keeps %s without remodel markers', (name) => {
    const ship = data.ships.find((item) => item.names.en === name)!;
    for (const variant of [ship, ...(ship.variants ?? [])]) {
      for (const language of ['zh', 'ja', 'en'] as const) expect(shipDisplayName(ship, variant, language)).toBe(ship.names[language]);
    }
  });
});

describe('Japanese destroyer class boards', () => {
  const candidates = candidatesFor(data.ships);
  const byName = (name: string) => candidates.find((candidate) => candidate.ship.names.en === name)!;
  const shimakaze = byName('Shimakaze');
  const yukikaze = byName('Yukikaze');
  const fletcher = byName('Fletcher');
  const pick = (candidate: typeof shimakaze) => ({ shipId: candidate.ship.id, variantId: candidate.variants[0].id });

  it.each([
    ['Hatakaze', ['五番舰', '5番艦', '5th ship']],
    ['Mutsuki', ['一番舰', '1番艦', '1st ship']],
    ['Shirakumo', ['八番舰', '8番艦', '8th ship']],
    ['Ushio', ['十番舰', '10番艦', '10th ship']],
    ['Hibiki', ['二番舰', '2番艦', '2nd ship']],
  ])('uses the class ordinal for %s, including renamed remodels', (name, expected) => {
    const ship = byName(name).ship;
    expect((['zh', 'ja', 'en'] as const).map((language) => shipClassOrdinal(ship.classNumber, language))).toEqual(expected);
  });

  it('formats teen ordinals and does not invent missing numbers', () => {
    expect([11, 12, 13, 21, 22, 23].map((number) => shipClassOrdinal(number, 'en'))).toEqual(['11th ship', '12th ship', '13th ship', '21st ship', '22nd ship', '23rd ship']);
    expect(shipClassOrdinal(12, 'zh')).toBe('十二番舰');
    expect(shipClassOrdinal(undefined, 'zh')).toBe('—');
    expect(shipClassOrdinal(0, 'ja')).toBe('—');
  });

  it('offers 13 Japanese classes in a stable order with 113 eligible shipgirls', () => {
    const slots = boardSlots(data.ships, 'dd-classes');
    expect(slots.map((slot) => slot.names.ja)).toEqual(['神風型', '睦月型', '吹雪型', '綾波型', '暁型', '初春型', '白露型', '朝潮型', '陽炎型', '夕雲型', '秋月型', '島風型', '松型']);
    expect(candidates.filter((candidate) => slots.some((slot) => matchesSlot(candidate, slot.id)))).toHaveLength(113);
    expect(boardSlots(data.ships, 'types').map((slot) => slot.id)).toEqual(GROUPS.map((group) => group.id));
  });

  it('uses verified silhouettes for all thirteen classes and existing assets for every slot', () => {
    const slots = boardSlots(data.ships, 'dd-classes');
    expect(slots.filter((slot) => slot.icon.includes('/destroyer-classes/'))).toHaveLength(13);
    for (const slot of slots) expect(existsSync(new URL(`../public${slot.icon}`, import.meta.url))).toBe(true);
    const eligible = candidates.filter((candidate) => slots.some((slot) => matchesSlot(candidate, slot.id)));
    expect(eligible.every((candidate) => candidate.ship.classNumber && candidate.ship.classNumber > 0)).toBe(true);
  });

  it('gives every export icon explicit intrinsic dimensions for Firefox', () => {
    const icons = new Set((['types', 'dd-classes'] as const).flatMap((mode) =>
      boardSlots(data.ships, mode).map((slot) => slot.icon)));
    for (const icon of icons) {
      const svg = readFileSync(new URL(`../public${icon}`, import.meta.url), 'utf8');
      const root = svg.match(/<(?:[\w.-]+:)?svg\b[^>]*>/u)?.[0];
      expect(root, icon).toBeDefined();
      const attribute = (name: string) => root!.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'u'))?.[1];
      const width = Number(attribute('width'));
      const height = Number(attribute('height'));
      // A viewBox alone can decode successfully but expose 0 natural dimensions in Firefox.
      expect(Number.isFinite(width) && width > 0, icon).toBe(true);
      expect(Number.isFinite(height) && height > 0, icon).toBe(true);
      const viewBox = attribute('viewBox')?.trim().split(/[\s,]+/u).map(Number);
      expect(viewBox, icon).toHaveLength(4);
      expect(viewBox!.every(Number.isFinite) && viewBox![2] > 0 && viewBox![3] > 0, icon).toBe(true);
      expect(width / height, icon).toBeCloseTo(viewBox![2] / viewBox![3], 8);
    }
  });

  it('excludes overseas destroyers and rejects the wrong class or ship type', () => {
    expect(slotFor(fletcher, 'dd-classes')).toBeUndefined();
    expect(slotFor(candidatesFor([kitakami])[0], 'dd-classes')).toBeUndefined();
    expect(slotFor(yukikaze, 'dd-classes')).toBe('DD:30');
    expect(matchesSlot(yukikaze, 'DD:30')).toBe(true);
    expect(matchesSlot(yukikaze, 'DD:22')).toBe(false);
    expect(matchesSlot(fletcher, 'DD:30')).toBe(false);
    expect(slotFor(yukikaze, 'types')).toBe('DD');
  });

  it('hides only Shimakaze and retains her pick when restoring a hidden class', () => {
    const board: SavedBoard = { version: 1, nickname: '', mode: 'dd-classes', showShimakaze: false, picks: { 'DD:22': pick(shimakaze) } };
    expect(boardSlots(data.ships, 'dd-classes', false)).toHaveLength(12);
    expect(boardSlots(data.ships, 'dd-classes', false).some((slot) => matchesSlot(shimakaze, slot.id))).toBe(false);
    const restored = decodeBoard(encodeBoard(board), data.ships)!;
    expect(restored).toEqual({ ...board, layout: cleanBoardLayout({ hidden: ['DD:22'] }, boardSlots(data.ships, 'dd-classes')) });
    expect(boardSlots(data.ships, 'dd-classes', true).some((slot) => slot.id in restored.picks)).toBe(true);
    expect(arrangedBoardSlots(boardSlots(data.ships, 'dd-classes'), restored.layout).some((slot) => slot.id === 'DD:22')).toBe(false);
  });

  it('round-trips both mode selections, the mode, and the switch with Unicode names', () => {
    const board: SavedBoard = { version: 1, nickname: '提督⚓', mode: 'dd-classes', showShimakaze: true, picks: { DD: pick(shimakaze), 'DD:30': pick(yukikaze) } };
    expect(decodeBoard(encodeBoard(board), data.ships)).toEqual(board);
    expect(decodeBoard(encodeBoard({ ...board, mode: 'types' }), data.ships)).toEqual({ ...board, mode: 'types' });
  });

  it('isolates the selections saved and shared by each independent page', () => {
    const board: SavedBoard = { version: 1, nickname: '提督', showShimakaze: false,
      picks: { DD: pick(yukikaze), 'DD:22': pick(shimakaze), 'DD:30': pick(yukikaze) } };
    const classBoard = boardForMode(board, 'dd-classes');
    expect(Object.keys(classBoard.picks)).toEqual(['DD:22', 'DD:30']);
    expect(classBoard.showShimakaze).toBe(false);
    expect(classBoard.layout?.hidden).toEqual(['DD:22']);
    expect(Object.keys(boardForMode(board, 'types').picks)).toEqual(['DD']);
    expect(board.picks).toHaveProperty('DD');
    expect(decodeBoard(encodeBoard(classBoard), data.ships)).toEqual({ ...classBoard,
      layout: cleanBoardLayout(classBoard.layout, boardSlots(data.ships, 'dd-classes')) });
  });

  it('rejects corrupted class selections, remodel mismatches, and unknown class keys', () => {
    const cleaned = cleanBoard({ mode: 'invalid', showShimakaze: 'false', picks: {
      'DD:22': pick(yukikaze), 'DD:30': pick(fletcher), 'DD:66': { shipId: yukikaze.ship.id, variantId: shimakaze.ship.id },
      'DD:91': pick(fletcher), 'DD:999': pick(yukikaze),
    } }, data.ships);
    expect(cleaned).toEqual({ version: 1, nickname: '', picks: {} });
  });

  it('validates artwork choices for class slots without removing other mode picks', () => {
    const artwork: Artwork = { id: 'class-test', shipId: yukikaze.ship.id, variantId: yukikaze.ship.id,
      names: yukikaze.ship.names, kind: 'standard', damage: 'normal', image: '/test.webp', source: '' };
    const board: SavedBoard = { version: 1, nickname: '', mode: 'dd-classes', picks: {
      'DD:30': { ...pick(yukikaze), artworkId: artwork.id }, DD: { ...pick(shimakaze), artworkId: artwork.id },
    } };
    const cleaned = cleanArtworkBoard(board, [artwork]);
    expect(cleaned.picks['DD:30']).toEqual(board.picks['DD:30']);
    expect(cleaned.picks.DD).toEqual(pick(shimakaze));
    expect(cleanArtworkBoard(board, []).picks['DD:30']).toEqual(pick(yukikaze));
  });
});

function rawPayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('export board layouts', () => {
  const typeSlots = boardSlots(data.ships, 'types');
  const classSlots = boardSlots(data.ships, 'dd-classes');

  it('keeps valid custom order, adds omitted slots, and rejects duplicate or foreign IDs', () => {
    const incoming = { order: ['AUX', 'DD:22', 'CL', 'AUX', 'missing', 4], hidden: ['CL', 'CL', 'DD:22', null, 'CA'], columns: 3 };
    const original = structuredClone(incoming);
    const layout = cleanBoardLayout(incoming, typeSlots);
    expect(layout).toEqual({ order: ['AUX', 'CL', ...typeSlots.map((slot) => slot.id).filter((id) => id !== 'AUX' && id !== 'CL')], hidden: ['CL', 'CA'], columns: 3 });
    expect(incoming).toEqual(original);
    const arranged = arrangedBoardSlots(typeSlots, layout);
    expect(arranged.map((slot) => slot.id)).toEqual(layout.order.filter((id) => !layout.hidden.includes(id)));
    expect(arranged[0]).toBe(typeSlots.find((slot) => slot.id === 'AUX'));
  });

  it.each([undefined, null, false, 5, 'invalid', [], { order: 'DD', hidden: {}, columns: '3' }])('recovers from malformed layout %j', (value) => {
    expect(cleanBoardLayout(value, typeSlots)).toEqual({ order: typeSlots.map((slot) => slot.id), hidden: [], columns: DEFAULT_LAYOUT_COLUMNS });
  });

  it.each([0, -1, MAX_LAYOUT_COLUMNS + 1, 2.5, NaN, Infinity, '4', null])('rejects invalid column count %s', (columns) => {
    expect(cleanBoardLayout({ columns }, typeSlots).columns).toBe(DEFAULT_LAYOUT_COLUMNS);
  });

  it('accepts both column limits and handles an empty or fully hidden board', () => {
    expect(cleanBoardLayout({ columns: 1 }, typeSlots).columns).toBe(1);
    expect(cleanBoardLayout({ columns: MAX_LAYOUT_COLUMNS }, typeSlots).columns).toBe(MAX_LAYOUT_COLUMNS);
    expect(arrangedBoardSlots(typeSlots)).toEqual(typeSlots);
    expect(arrangedBoardSlots(typeSlots, cleanBoardLayout({ hidden: typeSlots.map((slot) => slot.id) }, typeSlots))).toEqual([]);
    expect(cleanBoardLayout({ order: ['DD'], hidden: ['DD'], columns: 2 }, [])).toEqual({ order: [], hidden: [], columns: 2 });
  });

  it('normalizes saved layouts against the active mode and defaults older payloads to types', () => {
    const layout = { order: ['DD:22', 'CA', 'DD:30'], hidden: ['DD:22', 'CA'], columns: 4 };
    expect(cleanBoard({ layout }, data.ships).layout).toEqual(cleanBoardLayout(layout, typeSlots));
    expect(cleanBoard({ mode: 'dd-classes', layout }, data.ships).layout).toEqual(cleanBoardLayout(layout, classSlots));
    expect(cleanBoard({ mode: 'invalid', layout }, data.ships).layout?.hidden).toEqual(['CA']);
  });

  it('lets explicit layouts override the legacy Shimakaze switch without deleting hidden picks', () => {
    const shimakaze = data.ships.find((ship) => ship.names.en === 'Shimakaze')!;
    const pick = { shipId: shimakaze.id, variantId: shimakaze.id };
    const layout = cleanBoardLayout({ order: ['DD:22'], hidden: ['DD:22'], columns: 2 }, classSlots);
    const board = cleanBoard({ mode: 'dd-classes', showShimakaze: false, layout, picks: { 'DD:22': pick } }, data.ships);
    expect(board.layout).toEqual(layout);
    expect(board.picks['DD:22']).toEqual(pick);
    expect(boardSlots(data.ships, 'dd-classes', true).some((slot) => slot.id === 'DD:22')).toBe(true);
    expect(arrangedBoardSlots(classSlots, board.layout).some((slot) => slot.id === 'DD:22')).toBe(false);
    expect(cleanBoard({ mode: 'dd-classes', showShimakaze: false, layout: { hidden: [] } }, data.ships).layout?.hidden).toEqual([]);
    expect(cleanBoard({ mode: 'dd-classes', showShimakaze: false, layout: null }, data.ships).layout?.hidden).toEqual([]);
  });

  it('isolates each mode’s order and visibility while preserving columns and selections', () => {
    const incoming: SavedBoard = { version: 1, nickname: '', picks: { CL: { shipId: '19', variantId: '95' } },
      layout: { order: ['DD:22', 'CA', 'DD:30', 'CL'], hidden: ['CL', 'DD:22'], columns: 6 } };
    const original = structuredClone(incoming);
    expect(boardForMode(incoming, 'types').layout).toEqual({ order: ['CA', 'CL'], hidden: ['CL'], columns: 6 });
    expect(boardForMode(incoming, 'dd-classes').layout).toEqual({ order: ['DD:22', 'DD:30'], hidden: ['DD:22'], columns: 6 });
    expect(boardForMode(incoming, 'types').picks.CL).toEqual(incoming.picks.CL);
    expect(incoming).toEqual(original);
  });

  it.each(['types', 'dd-classes'] as const)('round-trips order, visibility, and grid columns in a %s share', (mode) => {
    const slots = mode === 'types' ? typeSlots : classSlots;
    const layout = cleanBoardLayout({ order: [...slots].reverse().map((slot) => slot.id), hidden: [slots[1].id], columns: 4 }, slots);
    const board: SavedBoard = { version: 1, nickname: '提督⚓', mode, picks: {}, layout };
    expect(decodeBoard(encodeBoard(board), data.ships)).toEqual(board);
  });
});

describe('ship candidates', () => {
  it('offers one character per ship type while retaining her type-changing remodels', () => {
    const candidates = candidatesFor(ships);
    expect(candidates.map((candidate) => candidate.key)).toEqual(['19:CL', '70:CA']);
    expect(candidates.filter((candidate) => candidate.ship.id === '19')).toHaveLength(1);
    const torpedo = candidates.find((candidate) => candidate.key === '19:CL')!;
    expect(torpedo.ship).toBe(kitakami);
    expect(torpedo.variants.map((variant) => variant.id)).toEqual(['19', '51', '95']);
    expect(torpedo.variants.every((variant) => groupFor(variant.typeId) === 'CL')).toBe(true);
  });

  it('does not make duplicate cards or duplicate forms from repeated same-type data', () => {
    const duplicateBase: Ship = { ...kitakami, variants: [kitakami, ...(kitakami.variants ?? [])] };
    const candidates = candidatesFor([duplicateBase]);
    expect(candidates.filter((candidate) => candidate.typeId === 'CL')).toHaveLength(1);
    expect(candidates.find((candidate) => candidate.typeId === 'CL')!.variants.map((variant) => variant.id)).toEqual(['19', '51', '95']);
  });
});

describe('multilingual search', () => {
  const torpedo = candidatesFor(ships).find((candidate) => candidate.key === '19:CL')!;

  it.each(['北上', '北上改二', 'Kitakami', 'KITAKAMI KAI NI', '球磨型', 'Kuma Class', 'CLT'])('finds ship, remodel, class, or type names: %s', (query) => {
    expect(matchesSearch(torpedo, query)).toBe(true);
  });

  it('normalizes fullwidth text, case, spaces, and middle dots', () => {
    expect(matchesSearch(torpedo, '　ＫＩＴＡＫＡＭＩ ・ ＫＡＩ · ＮＩ　')).toBe(true);
    expect(matchesSearch(torpedo, 'Ｋｕｍａ　Ｃｌａｓｓ')).toBe(true);
    expect(matchesSearch(torpedo, '　')).toBe(true);
    expect(matchesSearch(torpedo, 'Mogami')).toBe(false);
  });
});

describe('saved and shared boards', () => {
  const board: SavedBoard = {
    version: 1,
    nickname: '提督 雪風⚓️',
    picks: {
      CL: { shipId: '19', variantId: '95', artworkId: '北上-夏季-中破' },
      CA: { shipId: '70', variantId: '73' },
    },
  };

  it('round-trips Unicode nicknames and artwork choices in a URL-safe payload', () => {
    const encoded = encodeBoard(board);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBoard(encoded, ships)).toEqual(board);
  });

  it.each(['', '%%%invalid%%%', rawPayload('not a board'), rawPayload(null), rawPayload({ version: 2, picks: {} }), rawPayload({ picks: {} })])('rejects malformed or unsupported payload %s', (encoded) => {
    expect(decodeBoard(encoded, ships)).toBeNull();
  });

  it('rejects a syntactically valid oversized board before accepting its selections', () => {
    const oversized = rawPayload({ ...board, nickname: '提督'.repeat(5_000) });
    expect(oversized.length).toBeGreaterThan(12_000);
    expect(decodeBoard(oversized, ships)).toBeNull();
  });

  it('removes invalid picks while migrating a valid former subtype slot', () => {
    const cleaned = cleanBoard({ version: 1, nickname: 'Admiral', picks: {
      CL: { shipId: '70', variantId: '70' },
      CLT: { shipId: '19', variantId: 'missing' },
      CA: { shipId: 'missing', variantId: '70' },
      CAV: { shipId: '70', variantId: '73', artworkId: 'mogami-standard-damaged' },
      UNKNOWN: { shipId: '19', variantId: '19' },
    } }, ships);
    expect(cleaned).toEqual({ version: 1, nickname: 'Admiral', picks: {
      CA: { shipId: '70', variantId: '73', artworkId: 'mogami-standard-damaged' },
    } });
  });

  it('migrates old shared subtype slots and prefers an existing parent selection', () => {
    const parent = { shipId: '19', variantId: '19' };
    const remodel = { shipId: '19', variantId: '95', artworkId: 'summer' };
    expect(decodeBoard(rawPayload({ version: 1, picks: { CLT: remodel } }), ships)?.picks.CL).toEqual(remodel);
    expect(cleanBoard({ picks: { CL: parent, CLT: remodel } }, ships).picks.CL).toEqual(parent);
  });

  it('keeps a valid artwork ID and drops a malformed non-string artwork ID', () => {
    expect(cleanBoard(board, ships)).toEqual(board);
    expect(cleanBoard({ picks: { CL: { shipId: '19', variantId: '95', artworkId: { id: 'bad' } } } }, ships).picks.CL).toEqual({ shipId: '19', variantId: '95' });
  });

  it('recovers safely from invalid persisted data and limits the displayed nickname', () => {
    expect(cleanBoard(null, ships)).toEqual({ version: 1, nickname: '', picks: {} });
    expect(cleanBoard({ nickname: 'a'.repeat(100), picks: { CL: 'invalid' } }, ships)).toEqual({ version: 1, nickname: 'a'.repeat(24), picks: {} });
  });
});

describe('bundled ship catalog', () => {
  it('contains 332 distinct playable shipgirls and covers all 19 ship types', () => {
    expect(data.ships).toHaveLength(332);
    expect(new Set(data.ships.map((ship) => ship.id)).size).toBe(332);
    expect(GROUPS).toHaveLength(10);
    expect(SHIP_TYPES).toHaveLength(19);
    const candidates = candidatesFor(data.ships);
    expect(new Set(candidates.map((candidate) => candidate.typeId))).toEqual(new Set(GROUPS.map((group) => group.id)));
    expect(new Set(candidates.map((candidate) => candidate.key)).size).toBe(candidates.length);
    for (const candidate of candidates) {
      expect(new Set(candidate.variants.map((variant) => variant.id)).size).toBe(candidate.variants.length);
      expect(candidate.variants.every((variant) => groupFor(variant.typeId) === candidate.typeId)).toBe(true);
    }
  });

  it('preserves real type-changing ships under both of their relevant categories', () => {
    const candidates = candidatesFor(data.ships);
    const typesFor = (name: string) => candidates.filter((candidate) => candidate.ship.names.en === name).map((candidate) => candidate.typeId);
    expect(typesFor('Kitakami')).toEqual(['CL']);
    expect(typesFor('Mogami')).toEqual(['CA']);
    expect(typesFor('Chitose')).toEqual(['AV', 'CVL']);
  });

  it('has all three names and a valid local PNG portrait for every one of its 865 forms', () => {
    const forms = data.ships.flatMap((ship) => [ship, ...(ship.variants ?? [])]);
    expect(forms).toHaveLength(865);
    expect(new Set(forms.map((form) => form.id)).size).toBe(forms.length);
    for (const form of forms) {
      for (const language of ['zh', 'ja', 'en'] as const) {
        expect(form.names[language], `${form.id} ${language} name`).toBeTypeOf('string');
        expect(form.names[language].trim().length, `${form.id} ${language} name`).toBeGreaterThan(0);
      }
      expect(form.image, `${form.id} local image`).toMatch(/^\/ships\/\d+\.png$/);
      const path = new URL(`../public${form.image}`, import.meta.url);
      expect(existsSync(path), `${form.id} portrait exists`).toBe(true);
      const png = readFileSync(path);
      expect(png.subarray(0, 8).toString('hex'), `${form.id} valid PNG`).toBe('89504e470d0a1a0a');
    }
  });
});

describe('artwork restoration', () => {
  const standard: Artwork = {
    id: 'kitakami-standard', shipId: '19', variantIds: ['51', '95'],
    names: { zh: '北上', ja: '北上', en: 'Kitakami' },
    kind: 'standard', damage: 'normal', image: '/artworks/kitakami.png',
    source: 'https://zh.kcwiki.cn/wiki/北上',
  };
  const withArtwork = (artworkId: string, variantId = '95'): SavedBoard => ({
    version: 1, nickname: '提督', picks: { CL: { shipId: '19', variantId, artworkId } },
  });

  it('keeps artwork explicitly compatible with either of a ship’s shared remodel forms', () => {
    expect(cleanArtworkBoard(withArtwork(standard.id, '51'), [standard])).toEqual(withArtwork(standard.id, '51'));
    expect(cleanArtworkBoard(withArtwork(standard.id, '95'), [standard])).toEqual(withArtwork(standard.id, '95'));
  });

  it('rejects another ship’s artwork while preserving the chosen ship and form', () => {
    const wrongShip = { ...standard, shipId: '70' };
    expect(cleanArtworkBoard(withArtwork(standard.id), [wrongShip])).toEqual({
      version: 1, nickname: '提督', picks: { CL: { shipId: '19', variantId: '95' } },
    });
  });

  it('rejects incompatible or unavailable artwork without changing the incoming board', () => {
    const incoming = withArtwork(standard.id);
    const original = structuredClone(incoming);
    const incompatible = { ...standard, variantIds: ['51'] };
    const expected = { version: 1, nickname: '提督', picks: { CL: { shipId: '19', variantId: '95' } } };
    expect(cleanArtworkBoard(incoming, [incompatible])).toEqual(expected);
    expect(cleanArtworkBoard(incoming, [])).toEqual(expected);
    expect(incoming).toEqual(original);
  });

  it('supports catalogs with a single variantId as well as variantIds', () => {
    const singleVariant = { ...standard, variantIds: undefined, variantId: '95' };
    expect(cleanArtworkBoard(withArtwork(standard.id), [singleVariant])).toEqual(withArtwork(standard.id));
    expect(cleanArtworkBoard(withArtwork(standard.id, '51'), [singleVariant]).picks.CL).toEqual({ shipId: '19', variantId: '51' });
  });
});

describe('merged categories and ship classes', () => {
  it.each([['CLT', 'CL'], ['CT', 'CL'], ['CAV', 'CA'], ['BBV', 'BB'], ['SSV', 'SS'], ['CVB', 'CV'], ['AV', 'AV'], ['AO', 'AUX'], ['AS', 'AUX'], ['LHA', 'AUX'], ['AR', 'AUX']] as const)('migrates %s into %s without losing the selected form', (oldType, groupId) => {
    const ship = data.ships.find((ship) => [ship, ...(ship.variants ?? [])].some((form) => form.typeId === oldType))!;
    const variant = [ship, ...(ship.variants ?? [])].find((form) => form.typeId === oldType)!;
    const pick = { shipId: ship.id, variantId: variant.id, artworkId: 'unchanged' };
    expect(cleanBoard({ picks: { [oldType]: pick } }, data.ships).picks).toEqual({ [groupId]: pick });
  });

  it('has localized class names for every ship and groups sisters in the chooser', () => {
    for (const ship of data.ships) {
      expect(ship.classId).toBeTruthy();
      for (const lang of ['zh', 'ja', 'en'] as const) expect(ship.className?.[lang].trim()).toBeTruthy();
    }
    const candidates = candidatesFor(data.ships).filter((candidate) => candidate.typeId === 'CL');
    const groups = candidatesByClass(candidates, 'zh');
    const kuma = groups.find((group) => group.names.zh === '球磨型')!;
    expect(kuma.candidates.map((candidate) => candidate.ship.names.en)).toEqual(['Kuma', 'Tama', 'Kitakami', 'Ooi', 'Kiso']);
    expect(groups.flatMap((group) => group.candidates)).toHaveLength(candidates.length);
    expect(matchesSearch(kuma.candidates[0], 'Kuma Class')).toBe(true);
  });
});

describe('class and illustration ordering', () => {
  it('keeps the same old-to-new Japanese-first class order in every language', () => {
    const candidates = candidatesFor(data.ships).filter((candidate) => candidate.typeId === 'DD');
    const ids = candidatesByClass(candidates, 'zh').map((group) => group.key);
    expect(ids.slice(0, 5)).toEqual(['66', '28', '12', '1', '5']);
    expect(ids.indexOf('30')).toBeLessThan(ids.indexOf('38'));
    expect(ids.indexOf('101')).toBeLessThan(ids.indexOf('48'));
    for (const lang of ['ja', 'en'] as const) expect(candidatesByClass(candidates, lang).map((group) => group.key)).toEqual(ids);
    for (const typeId of GROUPS.map((group) => group.id)) {
      const groups = candidatesByClass(candidatesFor(data.ships).filter((candidate) => candidate.typeId === typeId), 'zh');
      expect(groups.every((group) => CLASS_ORDER[typeId].includes(group.key))).toBe(true);
    }
  });

  it('keeps all standard sets first, then sorts forms and keeps shared artwork at its earliest eligible form', () => {
    const candidate = candidatesFor([{ ...kitakami, variants: kitakami.variants!.map((variant) => ({ ...variant, typeId: 'CL' as const })) }])[0];
    const art = (id: string, variantIds: string[], kind: 'standard' | 'seasonal', damage: 'normal' | 'damaged'): Artwork => ({
      id, shipId: kitakami.id, variantIds, kind, damage,
      names: kitakami.names, image: '/test.webp', source: '',
    });
    const input = [art('seasonal-base', ['19'], 'seasonal', 'normal'), art('kai-ni', ['95'], 'standard', 'normal'), art('kai', ['51'], 'standard', 'normal'), art('base-damaged', ['19'], 'standard', 'damaged'), art('base', ['19'], 'standard', 'normal'), art('shared', ['51', '95'], 'standard', 'damaged')];
    expect(sortArtworks(input, candidate).map((art) => art.id)).toEqual(['base', 'base-damaged', 'kai', 'shared', 'kai-ni', 'seasonal-base']);
    expect(input[0].id).toBe('seasonal-base');
  });

  const seasonal = (id: string, filename: string, damage: Artwork['damage'], extra: Partial<Artwork> = {}): Artwork => ({
    id, shipId: kitakami.id, variantId: kitakami.id, names: kitakami.names,
    kind: 'seasonal', damage, image: '/test.webp', source: '',
    sourceImage: `https://uploads.kcwiki.cn/commons/a/ab/${filename}`, ...extra,
  });

  it('orders seasonal sets by year and keeps each normal/damaged pair together even when the input is interleaved', () => {
    const candidate = candidatesFor([kitakami])[0];
    const input = [
      seasonal('new-normal', 'KanMusu019HDIllustChristmas2026.png', 'normal'),
      seasonal('unknown-damaged', 'KanMusu019HDDmgIllustTsuyu.png', 'damaged'),
      seasonal('old-damaged', 'KanMusu019DmgIllustChristmas2019.png', 'damaged'),
      seasonal('old-normal', 'KanMusu019HDIllustChristmas2019.png', 'normal'),
      seasonal('new-damaged', 'KanMusu019HDDmgIllustChristmas2026.png', 'damaged'),
      seasonal('unknown-normal', 'KanMusu019HDIllustTsuyu.png', 'normal'),
    ];
    expect(sortArtworks(input, candidate).map((art) => art.id)).toEqual([
      'old-normal', 'old-damaged', 'new-normal', 'new-damaged', 'unknown-normal', 'unknown-damaged',
    ]);
    expect(sortArtworks(input.filter((art) => art.damage === 'normal'), candidate).map((art) => art.id))
      .toEqual(['old-normal', 'new-normal', 'unknown-normal']);
  });

  it('preserves separate costumes with the same translated event title and year', () => {
    const candidate = candidatesFor([kitakami])[0];
    const input = [
      seasonal('second-damaged', 'KanMusu019HDDmgIllustSeika2025-2.png', 'damaged'),
      seasonal('first-normal', 'KanMusu019HDIllustSeika2025.png', 'normal'),
      seasonal('second-normal', 'KanMusu019HDIllustSeika2025-2.png', 'normal'),
      seasonal('first-damaged', 'KanMusu019HDDmgIllustSeika2025.png', 'damaged'),
    ];
    expect(sortArtworks(input, candidate).map((art) => art.id))
      .toEqual(['second-normal', 'second-damaged', 'first-normal', 'first-damaged']);
  });

  it('finishes all forms within each season before advancing to another season', () => {
    const candidate = candidatesFor([{ ...kitakami, variants: kitakami.variants!.map((variant) => ({ ...variant, typeId: 'CL' as const })) }])[0];
    const input = [
      seasonal('new-base-normal', 'KanMusu019HDIllustChristmas2025.png', 'normal'),
      seasonal('old-kai-damaged', 'KanMusu020HDDmgIllustSeika2019.png', 'damaged', { variantId: '51' }),
      seasonal('winter-base-normal', 'KanMusu019HDIllustChristmas2019.png', 'normal'),
      seasonal('old-base-damaged', 'KanMusu019HDDmgIllustSeika2019.png', 'damaged'),
      seasonal('old-kai-normal', 'KanMusu020HDIllustSeika2019.png', 'normal', { variantId: '51' }),
      seasonal('standard-kai', 'KanMusu020HDIllust.png', 'normal', { variantId: '51', kind: 'standard' }),
      seasonal('winter-kai-normal', 'KanMusu020HDIllustChristmas2019.png', 'normal', { variantId: '51' }),
      seasonal('old-base-normal', 'KanMusu019HDIllustSeika2019.png', 'normal'),
      seasonal('standard-base', 'KanMusu019HDIllust.png', 'normal', { kind: 'standard' }),
      seasonal('new-base-damaged', 'KanMusu019HDDmgIllustChristmas2025.png', 'damaged'),
      seasonal('old-kai-ni-normal', 'KanMusu021HDIllustSeika2019-2.png', 'normal', { variantId: '95' }),
    ];
    expect(sortArtworks(input, candidate).map((art) => art.id)).toEqual([
      'standard-base', 'standard-kai',
      'old-base-normal', 'old-base-damaged', 'old-kai-normal', 'old-kai-damaged', 'old-kai-ni-normal',
      'winter-base-normal', 'winter-kai-normal',
      'new-base-normal', 'new-base-damaged',
    ]);
  });

  it('finds years omitted from display titles and pairs legacy social-media images by their Chinese title', () => {
    const candidate = candidatesFor([kitakami])[0];
    const input = [
      seasonal('new-damaged', 'social-b.png', 'damaged', { names: { ...kitakami.names, zh: '北上 盛夏季节中破立绘' }, sourceCaption: '北上 2025盛夏季节中破立绘' }),
      seasonal('older-damaged', 'KanMusu019HDDmgIllustShoshuu2022.png', 'damaged', { sourceCaption: '北上 2022初秋限定中破立绘' }),
      seasonal('new-normal', 'social-a.png', 'normal', { names: { ...kitakami.names, zh: '北上 盛夏季节立绘' }, sourceCaption: '北上 2025盛夏季节立绘' }),
      seasonal('older-normal', 'KanMusu019HDIllustShoshuu2022.png', 'normal', { sourceCaption: '北上 2022初秋限定立绘' }),
    ];
    expect(sortArtworks(input, candidate).map((art) => art.id))
      .toEqual(['older-normal', 'older-damaged', 'new-normal', 'new-damaged']);
    expect(sortArtworks(input.map((art) => ({ ...art, sourceImage: undefined })), candidate).map((art) => art.id))
      .toEqual(['older-normal', 'older-damaged', 'new-normal', 'new-damaged']);
  });

  it('orders the real Miyuki catalog by standard sets, forms and seasonal years', () => {
    const artworks = JSON.parse(readFileSync(new URL('../public/data/artworks.json', import.meta.url), 'utf8')).artworks as Artwork[];
    const miyuki = data.ships.find((ship) => ship.id === '11')!;
    const candidate = candidatesFor([miyuki])[0];
    const input = artworks.filter((art) => art.shipId === miyuki.id);
    expect(sortArtworks(input, candidate).map((art) => art.id)).toEqual([
      'art-11-3be898937ad9', 'art-11-13c9a79c982b',
      'art-11-2b17ff3ce6ca', 'art-11-77d7081d6d5d',
      'art-11-0c8be414a5c0', 'art-11-e35f62e01f32',
      'art-11-e0f90ae13972', 'art-11-1fc2b63a2d4e',
      'art-11-0cc0f2b69b1b', 'art-11-08cff4adbe1b',
    ]);
  });
});

describe('approved avatar framing', () => {
  const crops = JSON.parse(readFileSync(new URL('../public/data/avatar-crops.json', import.meta.url), 'utf8')).images;
  it.each([
    ['/artworks/58ce393c0222.webp', [121, 12, 256, 256]],
    ['/artworks/dfeccf8a2670.webp', [198, 0, 156, 156]],
  ])('preserves the approved crop for %s when regenerating the catalog', (path, rect) => {
    expect(crops[path as string].rect).toEqual(rect);
    expect(crops[path as string].method).toBe('manual');
  });
});
