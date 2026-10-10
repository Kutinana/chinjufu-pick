import { CLASS_ORDER, JAPANESE_DD_CLASSES, SHIMAKAZE_CLASS } from './class-order';
import { cleanAvatarAdjustment } from './avatar';
import { DESTROYER_CLASS_ICONS } from './destroyer-icons';
export type Language = 'zh' | 'ja' | 'en';
export type LocalizedName = Record<Language, string>;
export const SHIP_TYPES = [
  { id: 'DD', names: { zh: '驱逐舰', ja: '駆逐艦', en: 'Destroyer' }, icon: 'destroyer' },
  { id: 'DE', names: { zh: '海防舰', ja: '海防艦', en: 'Coastal Defense Ship' }, icon: 'escort' },
  { id: 'CL', names: { zh: '轻巡洋舰', ja: '軽巡洋艦', en: 'Light Cruiser' }, icon: 'cruiser' },
  { id: 'CLT', names: { zh: '重雷装巡洋舰', ja: '重雷装巡洋艦', en: 'Torpedo Cruiser' }, icon: 'torpedo' },
  { id: 'CA', names: { zh: '重巡洋舰', ja: '重巡洋艦', en: 'Heavy Cruiser' }, icon: 'heavy' },
  { id: 'CAV', names: { zh: '航空巡洋舰', ja: '航空巡洋艦', en: 'Aviation Cruiser' }, icon: 'aviation' },
  { id: 'BB', names: { zh: '战列舰', ja: '戦艦', en: 'Battleship' }, icon: 'battleship' },
  { id: 'BBV', names: { zh: '航空战列舰', ja: '航空戦艦', en: 'Aviation Battleship' }, icon: 'aviation' },
  { id: 'CV', names: { zh: '正规空母', ja: '正規空母', en: 'Fleet Carrier' }, icon: 'carrier' },
  { id: 'CVB', names: { zh: '装甲空母', ja: '装甲空母', en: 'Armored Carrier' }, icon: 'carrier' },
  { id: 'CVL', names: { zh: '轻空母', ja: '軽空母', en: 'Light Carrier' }, icon: 'carrier' },
  { id: 'AV', names: { zh: '水上机母舰', ja: '水上機母艦', en: 'Seaplane Tender' }, icon: 'seaplane' },
  { id: 'SS', names: { zh: '潜水舰', ja: '潜水艦', en: 'Submarine' }, icon: 'submarine' },
  { id: 'SSV', names: { zh: '潜水空母', ja: '潜水空母', en: 'Submarine Carrier' }, icon: 'submarine' },
  { id: 'AO', names: { zh: '补给舰', ja: '補給艦', en: 'Fleet Oiler' }, icon: 'oiler' },
  { id: 'AS', names: { zh: '潜水母舰', ja: '潜水母艦', en: 'Submarine Tender' }, icon: 'tender' },
  { id: 'LHA', names: { zh: '扬陆舰', ja: '揚陸艦', en: 'Landing Ship' }, icon: 'landing' },
  { id: 'AR', names: { zh: '工作舰', ja: '工作艦', en: 'Repair Ship' }, icon: 'repair' },
  { id: 'CT', names: { zh: '练习巡洋舰', ja: '練習巡洋艦', en: 'Training Cruiser' }, icon: 'training' },
] as const;
export type TypeId = typeof SHIP_TYPES[number]['id'];
export const GROUPS = [
  { id: 'DD', names: SHIP_TYPES[0].names, members: ['DD'], icon: '/icons/ship-types/dd.svg', code: 'DD' },
  { id: 'DE', names: SHIP_TYPES[1].names, members: ['DE'], icon: '/icons/ship-types/de.svg', code: 'DE' },
  { id: 'CL', names: SHIP_TYPES[2].names, members: ['CL', 'CLT', 'CT'], icon: '/icons/ship-types/cl.svg', code: 'CL / CLT / CT' },
  { id: 'CA', names: SHIP_TYPES[4].names, members: ['CA', 'CAV'], icon: '/icons/ship-types/ca.svg', code: 'CA / CAV' },
  { id: 'BB', names: SHIP_TYPES[6].names, members: ['BB', 'BBV'], icon: '/icons/ship-types/bb.svg', code: 'BB / BBV' },
  { id: 'CV', names: SHIP_TYPES[8].names, members: ['CV', 'CVB'], icon: '/icons/ship-types/cv.svg', code: 'CV / CVB' },
  { id: 'CVL', names: SHIP_TYPES[10].names, members: ['CVL'], icon: '/icons/ship-types/cvl.svg', code: 'CVL' },
  { id: 'AV', names: SHIP_TYPES[11].names, members: ['AV'], icon: '/icons/ship-types/av.svg', code: 'AV' },
  { id: 'SS', names: SHIP_TYPES[12].names, members: ['SS', 'SSV'], icon: '/icons/ship-types/ss.svg', code: 'SS / SSV' },
  { id: 'AUX', names: { zh: '辅助舰', ja: '補助艦', en: 'Auxiliary Ships' }, members: ['AO', 'AS', 'LHA', 'AR'], icon: '/icons/ship-types/aux.svg', code: 'AO / AS / LHA / AR' },
] as const;
export type GroupId = typeof GROUPS[number]['id'];
export type BoardMode = 'types' | 'dd-classes';
export type DDClassId = typeof JAPANESE_DD_CLASSES[number];
export type SlotId = GroupId | `DD:${DDClassId}`;
export interface BoardSlot { id: SlotId; names: LocalizedName; icon: string; code: string }
export interface BoardLayout { order: SlotId[]; hidden: SlotId[]; columns: number }
export const DEFAULT_LAYOUT_COLUMNS = 5;
export const MAX_LAYOUT_COLUMNS = 6;

/** Layout only controls presentation; every available slot remains in the order. */
export function cleanBoardLayout(value: unknown, slots: readonly BoardSlot[]): BoardLayout {
  const incoming = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowed = new Set(slots.map((slot) => slot.id));
  const cleanIds = (value: unknown): SlotId[] => {
    const ids = new Set<SlotId>();
    if (Array.isArray(value)) for (const id of value) {
      if (typeof id === 'string' && allowed.has(id as SlotId)) ids.add(id as SlotId);
    }
    return [...ids];
  };
  const order = cleanIds(incoming.order);
  const present = new Set(order);
  for (const slot of slots) if (!present.has(slot.id)) { order.push(slot.id); present.add(slot.id); }
  return {
    order,
    hidden: cleanIds(incoming.hidden),
    columns: typeof incoming.columns === 'number' && Number.isInteger(incoming.columns)
      && incoming.columns >= 1 && incoming.columns <= MAX_LAYOUT_COLUMNS ? incoming.columns : DEFAULT_LAYOUT_COLUMNS,
  };
}

export function arrangedBoardSlots(slots: readonly BoardSlot[], layout?: BoardLayout): BoardSlot[] {
  const cleaned = cleanBoardLayout(layout, slots);
  const hidden = new Set(cleaned.hidden);
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  return cleaned.order.filter((id) => !hidden.has(id)).map((id) => byId.get(id)!);
}
/** Ordinal within the game's ship class, independent of the selected remodel. */
export function shipClassOrdinal(number: number | undefined, language: Language): string {
  if (!number || !Number.isInteger(number) || number < 1) return '—';
  if (language === 'ja') return `${number}番艦`;
  if (language === 'zh') {
    const digits = '零一二三四五六七八九';
    const label = number < 10 ? digits[number] : number < 100
      ? `${number < 20 ? '' : digits[Math.floor(number / 10)]}十${number % 10 ? digits[number % 10] : ''}` : String(number);
    return `${label}番舰`;
  }
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[number % 10] ?? 'th';
  return `${number}${suffix} ship`;
}
export function groupFor(typeId: TypeId): GroupId {
  return GROUPS.find((group) => (group.members as readonly string[]).includes(typeId))!.id;
}
export interface ShipVariant {
  id: string;
  names: LocalizedName;
  typeId: TypeId;
  image: string;
  portrait?: string;
}
export interface Ship extends ShipVariant {
  classId?: string;
  classNumber?: number;
  sortNo?: number;
  className?: LocalizedName;
  variants?: ShipVariant[];
}
export interface ShipData {
  updatedAt: string;
  sources: { name: string; url: string }[];
  ships: Ship[];
}
export interface Candidate {
  key: string;
  ship: Ship;
  typeId: GroupId;
  variants: ShipVariant[];
}
export interface Artwork {
  id: string;
  shipId: string;
  variantId?: string;
  variantIds?: string[];
  names: LocalizedName;
  kind: 'standard' | 'seasonal';
  damage: 'normal' | 'damaged';
  image: string;
  thumbnail?: string;
  source: string;
  sourceImage?: string;
  sourceCaption?: string;
}
export interface AvatarCrop {
  size: [number, number];
  rect: [number, number, number, number] | null;
  method: string;
  score: number;
}
export interface AvatarCropData { version: 1; images: Record<string, AvatarCrop> }
export interface ArtworkData {
  updatedAt: string;
  sources: { name: string; url: string }[];
  artworks: Artwork[];
}
export interface AvatarAdjustment { image: string; size: [number, number]; rect: [number, number, number, number] }
export interface Pick { shipId: string; variantId: string; artworkId?: string; avatar?: AvatarAdjustment; useOriginalName?: boolean }
export type Picks = Partial<Record<SlotId, Pick>>;
export interface SavedBoard { version: 1; nickname: string; picks: Picks; mode?: BoardMode; showShimakaze?: boolean; layout?: BoardLayout }

/** Each page saves and shares only its own selections and layout. Hidden picks are kept. */
export function boardForMode(board: SavedBoard, mode: BoardMode): SavedBoard {
  const belongsToMode = (key: string) => key.startsWith('DD:') === (mode === 'dd-classes');
  const layout = board.layout ? {
    ...board.layout,
    order: board.layout.order.filter(belongsToMode),
    hidden: board.layout.hidden.filter(belongsToMode),
  } : mode === 'dd-classes' && board.showShimakaze === false ? {
    order: [], hidden: [`DD:${SHIMAKAZE_CLASS}` as SlotId], columns: DEFAULT_LAYOUT_COLUMNS,
  } : undefined;
  return { ...board, mode, picks: Object.fromEntries(Object.entries(board.picks)
    .filter(([key]) => belongsToMode(key))) as Picks, ...(layout ? { layout } : {}) };
}

export function slotFor(candidate: Candidate, mode: BoardMode): SlotId | undefined {
  if (mode === 'types') return candidate.typeId;
  const classId = candidate.ship.classId;
  return candidate.typeId === 'DD' && JAPANESE_DD_CLASSES.some((id) => id === classId)
    ? `DD:${classId as DDClassId}` : undefined;
}

export function matchesSlot(candidate: Candidate, slotId: SlotId): boolean {
  return slotId.startsWith('DD:')
    ? candidate.typeId === 'DD' && `DD:${candidate.ship.classId}` === slotId
    : candidate.typeId === slotId;
}

export function boardSlots(ships: Ship[], mode: BoardMode, showShimakaze = true): BoardSlot[] {
  if (mode === 'types') return [...GROUPS];
  return JAPANESE_DD_CLASSES.flatMap((classId) => {
    if (!showShimakaze && classId === SHIMAKAZE_CLASS) return [];
    const ship = ships.find((item) => item.classId === classId && item.typeId === 'DD');
    return ship?.className ? [{ id: `DD:${classId}` as SlotId, names: ship.className, icon: DESTROYER_CLASS_ICONS[classId] ?? GROUPS[0].icon, code: 'DD' }] : [];
  });
}

export function candidatesFor(ships: Ship[]): Candidate[] {
  return ships.flatMap((ship) => {
    const variants = [ship, ...(ship.variants ?? [])];
    const byType = new Map<GroupId, ShipVariant[]>();
    for (const variant of variants) {
      if (!SHIP_TYPES.some((type) => type.id === variant.typeId)) continue;
      const groupId = groupFor(variant.typeId);
      const list = byType.get(groupId) ?? [];
      if (!list.some((item) => item.id === variant.id)) list.push(variant);
      byType.set(groupId, list);
    }
    return [...byType].map(([typeId, variants]) => ({ key: `${ship.id}:${typeId}`, ship, typeId, variants }));
  });
}

export function candidatesByClass(candidates: Candidate[], language: Language) {
  const groups = new Map<string, { key: string; names: LocalizedName; candidates: Candidate[] }>();
  for (const candidate of candidates) {
    const names = candidate.ship.className ?? { zh: '其他舰级', ja: 'その他の艦級', en: 'Other Classes' };
    const key = candidate.ship.classId ?? names.ja;
    const group = groups.get(key) ?? { key, names, candidates: [] };
    group.candidates.push(candidate);
    groups.set(key, group);
  }
  const collator = new Intl.Collator(language, { numeric: true });
  for (const group of groups.values()) group.candidates.sort((a, b) => (a.ship.classNumber ?? Number.MAX_SAFE_INTEGER) - (b.ship.classNumber ?? Number.MAX_SAFE_INTEGER));
  const order = CLASS_ORDER[candidates[0]?.typeId ?? ''] ?? [];
  const rank = (key: string) => { const index = order.indexOf(key); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
  return [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || collator.compare(a.names[language], b.names[language]));
}

export function sortArtworks(artworks: Artwork[], candidate: Candidate): Artwork[] {
  const formOrder = new Map(candidate.variants.map((variant, index) => [variant.id, index]));
  const rank = (art: Artwork) => Math.min(...(art.variantIds ?? (art.variantId ? [art.variantId] : []))
    .map((id) => formOrder.get(id) ?? Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  const year = (art: Artwork) => {
    // Display names may omit the year; retain the verified source information.
    const text = [art.sourceCaption, art.names.zh, art.names.ja, art.names.en, art.sourceImage].join(' ');
    return Number(text.match(/(?:^|\D)(20\d{2})(?!\d)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  };
  const setKey = (art: Artwork) => {
    const filename = art.sourceImage?.split(/[?#]/)[0].split('/').at(-1) ?? '';
    // These filenames distinguish multiple costumes from the same event/year.
    if (/^KanMusu\d/i.test(filename)) return filename.toLowerCase()
      .replace(/^(kanmusu\d+[a-z]?)hd/, '$1').replace(/dmg/g, '').replace(/\.[^.]+$/, '');
    // Social-media filenames have no normal/damaged relationship. Use the
    // Chinese title to pair them, independently of the current UI language.
    return art.names.zh.normalize('NFKC')
      .replace(/中破|大破|正常|普通|全身|立绘|立繪|图|圖/g, '')
      .replace(/[\s·・/／()（）]/g, '');
  };
  const seasonKey = (art: Artwork) => {
    const event = setKey(art).match(/^kanmusu\d+[a-z]?(?:illust|portrait)(.+)$/)?.[1];
    // Remodel IDs and alternate costumes do not create another season group.
    if (event) return event.replace(/20\d{2}/g, '').replace(/[-_]\d+$/, '');
    const translatedEvent = art.names.en.split(' · ').slice(1).join(' · ');
    if (translatedEvent) return translatedEvent.toLowerCase().replace(/20\d{2}|\(damaged\)|\s/g, '');
    let label = setKey(art);
    for (const form of [candidate.ship, ...(candidate.ship.variants ?? [])]
      .sort((a, b) => b.names.zh.length - a.names.zh.length)) {
      label = label.replaceAll(form.names.zh.normalize('NFKC').replace(/[\s·・/／()（）]/g, ''), '');
    }
    return label.replace(/20\d{2}|季节|季節|限定/g, '');
  };
  type ArtworkSet = { form: number; kind: number; year: number; season: string; index: number; artworks: Artwork[] };
  const sets = new Map<string, ArtworkSet>();
  artworks.forEach((art, index) => {
    const form = rank(art), kind = Number(art.kind === 'seasonal');
    const key = JSON.stringify([art.shipId, form, kind, setKey(art)]);
    const set = sets.get(key);
    if (set) {
      set.artworks.push(art);
      set.year = Math.min(set.year, year(art));
    } else sets.set(key, { form, kind, year: year(art), season: seasonKey(art), index, artworks: [art] });
  });
  const seasons = new Map<string, { kind: number; year: number; index: number; sets: ArtworkSet[] }>();
  for (const set of sets.values()) {
    // Standard artwork is the fixed first season, with the same form/pair rules.
    const key = set.kind === 0 ? 'standard' : JSON.stringify([set.year, set.season]);
    const season = seasons.get(key);
    if (season) season.sets.push(set);
    else seasons.set(key, { kind: set.kind, year: set.year, index: set.index, sets: [set] });
  }
  return [...seasons.values()].sort((a, b) => a.kind - b.kind || a.year - b.year || a.index - b.index)
    .flatMap((season) => season.sets.sort((a, b) => a.form - b.form || a.index - b.index)
      .flatMap((set) => set.artworks.sort((a, b) => Number(a.damage === 'damaged') - Number(b.damage === 'damaged'))));
}

export function findVariant(ships: Ship[], pick?: Pick): ShipVariant | undefined {
  const ship = ships.find((item) => item.id === pick?.shipId);
  return ship && [ship, ...(ship.variants ?? [])].find((item) => item.id === pick?.variantId);
}

export function shipDisplayName(ship: Ship, variant: ShipVariant, language: Language, useOriginalName = false): string {
  if (useOriginalName) return ship.names[language];
  // Compare names without remodel markers, then use the first form with that
  // identity for all three translations. Renamed forms keep their own identity.
  const identity = (name: string) => name.replace(/(?:\s+(?:Kai(?:\s.*)?|Zwei|Drei|Due|Deux|Dva|Andra|Nuovo|Amélioration|A|Kou|Mk\.II(?:\s+Mod\.2)?|Flight II|\((?:ASU|AGL|AGB|BC|CV)\)))+$/i, '').trim();
  const form = [ship, ...(ship.variants ?? [])].find((item) => identity(item.names.en) === identity(variant.names.en));
  return (form ?? variant).names[language];
}

export function cleanBoard(value: unknown, ships: Ship[]): SavedBoard {
  const board: SavedBoard = { version: 1, nickname: '', picks: {} };
  if (!value || typeof value !== 'object') return board;
  const incoming = value as Record<string, unknown>;
  if (typeof incoming.nickname === 'string') board.nickname = incoming.nickname.slice(0, 24);
  if (incoming.mode === 'types' || incoming.mode === 'dd-classes') board.mode = incoming.mode;
  if (typeof incoming.showShimakaze === 'boolean') board.showShimakaze = incoming.showShimakaze;
  const slots = boardSlots(ships, board.mode ?? 'types', true);
  if (incoming.layout !== undefined) board.layout = cleanBoardLayout(incoming.layout, slots);
  else if (board.mode === 'dd-classes' && board.showShimakaze === false) {
    board.layout = cleanBoardLayout({ hidden: [`DD:${SHIMAKAZE_CLASS}`] }, slots);
  }
  if (incoming.picks && typeof incoming.picks === 'object') {
    for (const group of GROUPS) {
      // Prefer the parent group's pick, then migrate the former subtype slots.
      for (const key of [group.id, ...group.members.filter((member) => member !== group.id)]) {
        const pick = (incoming.picks as Record<string, unknown>)[key];
        if (!pick || typeof pick !== 'object') continue;
        const record = pick as Record<string, unknown>;
        if (typeof record.shipId !== 'string' || typeof record.variantId !== 'string') continue;
        const variant = findVariant(ships, record as unknown as Pick);
        if (!variant || groupFor(variant.typeId) !== group.id || (key !== group.id && variant.typeId !== key)) continue;
        board.picks[group.id] = {
          shipId: record.shipId,
          variantId: record.variantId,
          ...(typeof record.artworkId === 'string' ? { artworkId: record.artworkId } : {}),
          ...(record.useOriginalName === true ? { useOriginalName: true } : {}),
        };
        const avatar = cleanAvatarAdjustment(record.avatar);
        if (avatar && (typeof record.artworkId === 'string' || avatar.image === variant.image)) board.picks[group.id]!.avatar = avatar;
        break;
      }
    }
    for (const classId of JAPANESE_DD_CLASSES) {
      const key = `DD:${classId}` as SlotId;
      const raw = (incoming.picks as Record<string, unknown>)[key];
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      if (typeof record.shipId !== 'string' || typeof record.variantId !== 'string') continue;
      const ship = ships.find((item) => item.id === record.shipId);
      const variant = findVariant(ships, record as unknown as Pick);
      if (ship?.classId !== classId || !variant || variant.typeId !== 'DD') continue;
      board.picks[key] = { shipId: record.shipId, variantId: record.variantId,
        ...(typeof record.artworkId === 'string' ? { artworkId: record.artworkId } : {}),
        ...(record.useOriginalName === true ? { useOriginalName: true } : {}) };
      const avatar = cleanAvatarAdjustment(record.avatar);
      if (avatar && (typeof record.artworkId === 'string' || avatar.image === variant.image)) board.picks[key]!.avatar = avatar;
    }
  }
  return board;
}

export function matchesSearch(candidate: Candidate, query: string): boolean {
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s・·]/g, '');
  const needle = normalize(query);
  return !needle || normalize([
    ...Object.values(candidate.ship.names),
    ...candidate.variants.flatMap((variant) => Object.values(variant.names)),
    ...Object.values(candidate.ship.className ?? {}),
    candidate.typeId,
    ...candidate.variants.map((variant) => variant.typeId),
  ].join(' ')).includes(needle);
}

export function cleanArtworkBoard(board: SavedBoard, artworks: Artwork[]): SavedBoard {
  const map = new Map(artworks.map((art) => [art.id, art]));
  const picks: Picks = {};
  for (const key of [...GROUPS.map((group) => group.id), ...JAPANESE_DD_CLASSES.map((id) => `DD:${id}` as SlotId)]) {
    const pick = board.picks[key];
    if (!pick) continue;
    if (!pick.artworkId) { picks[key] = pick; continue; }
    const art = pick.artworkId ? map.get(pick.artworkId) : undefined;
    const variants = art?.variantIds ?? (art?.variantId ? [art.variantId] : []);
    const valid = art?.shipId === pick.shipId && (!variants.length || variants.includes(pick.variantId));
    if (!valid) picks[key] = { shipId: pick.shipId, variantId: pick.variantId, ...(pick.useOriginalName ? { useOriginalName: true } : {}) };
    else if (pick.avatar && pick.avatar.image !== art!.image) {
      const { avatar: _avatar, ...withoutAvatar } = pick; picks[key] = withoutAvatar;
    } else picks[key] = pick;
  }
  return { ...board, picks };
}

export function encodeBoard(board: SavedBoard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(board));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBoard(encoded: string, ships: Ship[]): SavedBoard | null {
  try {
    if (encoded.length > 12000) return null;
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || (parsed as Record<string, unknown>).version !== 1) return null;
    return cleanBoard(parsed, ships);
  } catch { return null; }
}
