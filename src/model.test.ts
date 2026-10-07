import { CLASS_ORDER } from './class-order';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GROUPS,
  SHIP_TYPES,
  boardForMode,
  boardSlots,
  slotFor,
  matchesSlot,
  groupFor,
  candidatesFor,
  candidatesByClass,
  cleanArtworkBoard,
  cleanBoard,
  decodeBoard,
  encodeBoard,
  matchesSearch,
  sortArtworks,
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

describe('Japanese destroyer class boards', () => {
  const candidates = candidatesFor(data.ships);
  const byName = (name: string) => candidates.find((candidate) => candidate.ship.names.en === name)!;
  const shimakaze = byName('Shimakaze');
  const yukikaze = byName('Yukikaze');
  const fletcher = byName('Fletcher');
  const pick = (candidate: typeof shimakaze) => ({ shipId: candidate.ship.id, variantId: candidate.variants[0].id });

  it('offers 13 Japanese classes in a stable order with 113 eligible shipgirls', () => {
    const slots = boardSlots(data.ships, 'dd-classes');
    expect(slots.map((slot) => slot.names.ja)).toEqual(['神風型', '睦月型', '吹雪型', '綾波型', '暁型', '初春型', '白露型', '朝潮型', '陽炎型', '夕雲型', '秋月型', '島風型', '松型']);
    expect(candidates.filter((candidate) => slots.some((slot) => matchesSlot(candidate, slot.id)))).toHaveLength(113);
    expect(boardSlots(data.ships, 'types').map((slot) => slot.id)).toEqual(GROUPS.map((group) => group.id));
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
    expect(restored).toEqual(board);
    expect(boardSlots(data.ships, 'dd-classes', true).some((slot) => slot.id in restored.picks)).toBe(true);
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
    expect(Object.keys(boardForMode(board, 'types').picks)).toEqual(['DD']);
    expect(board.picks).toHaveProperty('DD');
    expect(decodeBoard(encodeBoard(classBoard), data.ships)).toEqual(classBoard);
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

  it('places standard illustrations first, then sorts forms before damage and keeps shared artwork at its earliest eligible form', () => {
    const candidate = candidatesFor([kitakami])[0];
    const art = (id: string, variantIds: string[], kind: 'standard' | 'seasonal', damage: 'normal' | 'damaged'): Artwork => ({
      id, shipId: kitakami.id, variantIds, kind, damage,
      names: kitakami.names, image: '/test.webp', source: '',
    });
    const input = [art('seasonal-base', ['19'], 'seasonal', 'normal'), art('kai-ni', ['95'], 'standard', 'normal'), art('kai', ['51'], 'standard', 'normal'), art('base-damaged', ['19'], 'standard', 'damaged'), art('base', ['19'], 'standard', 'normal'), art('shared', ['51', '95'], 'standard', 'damaged')];
    expect(sortArtworks(input, candidate).map((art) => art.id)).toEqual(['base', 'base-damaged', 'kai', 'shared', 'kai-ni', 'seasonal-base']);
    expect(input[0].id).toBe('seasonal-base');
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
