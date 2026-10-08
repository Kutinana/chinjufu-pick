import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Anchor, Check, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, Globe2, GripVertical, ImageIcon, Info, LayoutGrid, List, LoaderCircle, Minus, Move, Plus, RotateCcw, Search, Share2, X } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { GROUPS, SHIP_TYPES, arrangedBoardSlots, boardForMode, boardSlots, cleanBoardLayout, slotFor, matchesSlot, candidatesFor, candidatesByClass, cleanArtworkBoard, cleanBoard, decodeBoard, encodeBoard, findVariant, matchesSearch, sortArtworks, shipDisplayName, shipClassOrdinal } from './model';
import type { Artwork, ArtworkData, Candidate, Language, Picks, SavedBoard, ShipData, SlotId, TypeId, AvatarCrop, AvatarCropData, AvatarAdjustment } from './model';
import { initialLanguage, localizedCount, localizedSourceName, messages } from './i18n';
import { pageForPath, PICKUP_PATHS } from './routes';
import type { Page } from './routes';
import { exportBoard } from './export';
import ExportLayout from './ExportLayout';
import StyledSelect from './StyledSelect';
import { clampSquare, defaultSquare, resolveAvatarCrop, zoomSquare } from './avatar';
import type { Square } from './avatar';
import homeHeroSmall from './assets/home-hero-itsuumi-480.webp';
import homeHeroMedium from './assets/home-hero-itsuumi-800.webp';
import homeHeroLarge from './assets/home-hero-itsuumi-1200.webp';

const STORAGE_KEY = 'chinjufu-board-v1';
const CLASS_STORAGE_KEY = 'chinjufu-dd-class-board-v1';
const EMPTY: SavedBoard = { version: 1, nickname: '', picks: {} };
const PAGE_SIZE = 24;
let modalCount = 0;
let originalBodyOverflow = '';
const ModalClosing = createContext(false);
const MODAL_EXIT_MS = 180;

function ModalPresence({ children }: { children: ReactNode }) {
  const [retained, setRetained] = useState(children);
  const closing = !children && Boolean(retained);
  useEffect(() => {
    if (children) { setRetained(children); return; }
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MODAL_EXIT_MS;
    const timer = window.setTimeout(() => setRetained(null), duration);
    return () => window.clearTimeout(timer);
  }, [children]);
  return <ModalClosing.Provider value={closing}>{children || retained}</ModalClosing.Provider>;
}

function Modal({ title, language, onClose, children, className = '', onClickCapture }: { title: string; language: Language; onClose: () => void; children: ReactNode; className?: string; onClickCapture?: MouseEventHandler<HTMLDivElement> }) {
  const closing = useContext(ModalClosing);
  const closingRef = useRef(closing);
  closingRef.current = closing;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (modalCount === 0) originalBodyOverflow = document.body.style.overflow;
    modalCount += 1;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      (panel.current?.querySelector('[autofocus], input, button') as HTMLElement | null)?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (closingRef.current) return;
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      modalCount -= 1;
      if (modalCount === 0) document.body.style.overflow = originalBodyOverflow;
      const dialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
      const top = dialogs[dialogs.length - 1];
      if (top) {
        if (previous?.isConnected && top.contains(previous)) previous.focus();
        else if (!top.contains(document.activeElement)) top.querySelector<HTMLElement>('input, button, [tabindex="0"]')?.focus();
      } else if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className={`modal-backdrop${closing ? ' closing' : ''}`} style={{ '--modal-exit-duration': `${MODAL_EXIT_MS}ms` } as CSSProperties} onClick={(event) => { if (!closing && event.target === event.currentTarget) onClose(); }}>
    <div className="modal-shade" aria-hidden="true" />
    <div ref={panel} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={closing} onClickCapture={onClickCapture}>
      <div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={messages[language].close} onClick={onClose}><X size={22} /></button></div>
      {children}
    </div>
  </div>;
}

function TypeMark({ icon }: { icon: string }) {
  return <img src={icon} className="type-mark" alt="" aria-hidden="true" />;
}

function Image({ src, alt, className = '', style }: { src: string; alt: string; className?: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? <span className={`image-fallback ${className}`}><Anchor aria-label={alt} /></span> : <img src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function Avatar({ src, alt, crop }: { src: string; alt: string; crop?: AvatarCrop }) {
  if (!crop?.rect) return <Image className="portrait-art" src={src} alt={alt}/>;
  const [x, y, width, height] = crop.rect;
  return <span className="avatar-frame"><span className="avatar-crop"><Image src={src} alt={alt} className="avatar-source" style={{
    width: `${crop.size[0] / width * 100}%`, height: `${crop.size[1] / height * 100}%`,
    left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
  }}/></span></span>;
}

function applicableArt(art: Artwork, candidate: Candidate, variantId?: string): boolean {
  if (art.shipId !== candidate.ship.id) return false;
  const compatible = art.variantIds ?? (art.variantId ? [art.variantId] : candidate.variants.map((variant) => variant.id));
  return variantId ? compatible.includes(variantId) : candidate.variants.some((variant) => compatible.includes(variant.id));
}

function AvatarEditor({ image, name, language, base, adjustment, onClose, onApply }: {
  image: string; name: string; language: Language; base?: AvatarCrop; adjustment?: AvatarAdjustment;
  onClose: () => void; onApply: (value: AvatarAdjustment) => void;
}) {
  const t = messages[language];
  const [size, setSize] = useState<[number, number] | null>(base?.size ?? adjustment?.size ?? null);
  const [rect, setRect] = useState<Square | null>(() => size ? defaultSquare(size, resolveAvatarCrop(image, base, adjustment)?.rect) : null);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ pointer: number; x: number; y: number; rect: Square; width: number } | null>(null);
  const zoomId = useId();
  const original = size ? defaultSquare(size, base?.rect) : null;
  const zoom = rect && original ? original[2] / rect[2] : 1;
  const minZoom = size && original ? original[2] / Math.min(...size) : 1;
  const maxZoom = Math.max(4, zoom);
  function changeZoom(value: number) {
    if (size && original) setRect((current) => current && zoomSquare(size, current, original[2] / value));
  }
  function finishDrag() { drag.current = null; }
  return <Modal language={language} className="avatar-editor-modal" title={t.adjustAvatar} onClose={onClose}>
    <div className="avatar-editor-content modal-scroll"><p className="avatar-editor-help"><strong>{name}</strong><span>{t.avatarHelp}</span></p>
      <div className="avatar-editor-stage" role="group" aria-label={t.avatarPreview} tabIndex={0}
        onPointerDown={(event) => {
          if (!rect || failed || (event.pointerType === 'mouse' && event.button !== 0)) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, rect, width: event.currentTarget.getBoundingClientRect().width };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !size || start.pointer !== event.pointerId) return;
          const scale = start.rect[2] / start.width;
          setRect(clampSquare(size, [start.rect[0] - (event.clientX - start.x) * scale, start.rect[1] - (event.clientY - start.y) * scale, start.rect[2], start.rect[3]]));
        }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
        onKeyDown={(event) => {
          if (!size || !rect || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const step = rect[2] * (event.shiftKey ? .05 : .01);
          const dx = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
          const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
          setRect(clampSquare(size, [rect[0] + dx, rect[1] + dy, rect[2], rect[3]]));
        }}>
        <img src={image} alt={name} draggable={false} className="avatar-editor-image" style={size && rect ? {
          width: `${size[0] / rect[2] * 100}%`, height: `${size[1] / rect[3] * 100}%`, left: `${-rect[0] / rect[2] * 100}%`, top: `${-rect[1] / rect[3] * 100}%`,
        } : { opacity: 0 }} onLoad={(event) => {
          const loaded: [number, number] = [event.currentTarget.naturalWidth, event.currentTarget.naturalHeight];
          if (!size || size.some((value, index) => value !== loaded[index])) {
            setSize(loaded); setRect(defaultSquare(loaded, base?.size.every((value, index) => value === loaded[index]) ? resolveAvatarCrop(image, base, adjustment)?.rect : null));
          }
        }} onError={() => setFailed(true)}/>
        {(!rect || failed) && <span className="avatar-editor-status">{failed ? t.avatarLoadFailed : t.avatarLoading}</span>}
        <div className="avatar-editor-grid" aria-hidden="true"/>
      </div>
      <div className="avatar-zoom-control"><label htmlFor={zoomId}>{t.avatarZoom}<output>{Math.round(zoom * 100)}%</output></label><div>
        <button className="icon-button" aria-label={t.avatarZoomOut} disabled={!rect || failed} onClick={() => changeZoom(Math.max(minZoom, zoom / 1.1))}><Minus size={17}/></button>
        <input id={zoomId} aria-label={t.avatarZoom} type="range" min={minZoom} max={maxZoom} step="any" value={zoom} disabled={!rect || failed} onChange={(event) => changeZoom(Number(event.target.value))}/>
        <button className="icon-button" aria-label={t.avatarZoomIn} disabled={!rect || failed} onClick={() => changeZoom(Math.min(maxZoom, zoom * 1.1))}><Plus size={17}/></button>
      </div></div>
      <button className="text-button avatar-reset" disabled={!original || failed} onClick={() => setRect(original)}><RotateCcw size={14}/>{t.avatarReset}</button>
    </div>
    <div className="avatar-editor-footer"><button className="secondary-button" onClick={onClose}>{t.cancel}</button><button className="primary-button" disabled={!size || !rect || failed} onClick={() => {
      if (size && rect) onApply({ image, size, rect: rect.map((value) => Math.round(value * 1000) / 1000) as Square });
    }}><Check size={17}/>{t.avatarApply}</button></div>
  </Modal>;
}

function candidateShipTypes(candidate: Candidate) {
  return SHIP_TYPES.filter((type) => candidate.variants.some((variant) => variant.typeId === type.id));
}

function ArtworkPicker({ candidate, artworks, language, currentId, currentVariantId, currentAvatar, crops, onClose, onBack, onChoose }: {
  candidate: Candidate; artworks: Artwork[]; language: Language; currentId?: string; currentVariantId?: string; currentAvatar?: AvatarAdjustment; crops: AvatarCropData['images'];
  onClose: () => void; onBack: () => void; onChoose: (art: Artwork, variantId: string, avatar?: AvatarAdjustment) => void;
}) {
  const t = messages[language];
  const shipTypes = candidateShipTypes(candidate);
  const [variantId, setVariantId] = useState('all');
  const [kind, setKind] = useState('all');
  const [damage, setDamage] = useState('all');
  const [selectedId, setSelectedId] = useState(currentId ?? '');
  const [editing, setEditing] = useState<Artwork | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, AvatarAdjustment>>({});
  const lastClick = useRef<{ card: Element | null; detail: number; canConfirm: boolean } | null>(null);
  function adjustmentFor(art: Artwork) { return adjustments[art.id] ?? (art.id === currentId ? currentAvatar : undefined); }
  const available = useMemo(() => {
    const real = artworks.filter((art) => applicableArt(art, candidate, variantId === 'all' ? undefined : variantId));
    if (real.length) return sortArtworks(real, candidate);
    const variant = candidate.variants.find((item) => item.id === variantId) ?? candidate.variants[0];
    return [{ id: `fallback-${variant.id}`, shipId: candidate.ship.id, variantId, names: variant.names,
      kind: 'standard' as const, damage: 'normal' as const, image: variant.portrait ?? variant.image, source: 'https://zh.kcwiki.cn/wiki/舰娘百科' }];
  }, [artworks, candidate, variantId, language]);
  const filtered = available.filter((art) => (kind === 'all' || art.kind === kind) && (damage === 'all' || art.damage === damage));
  const selected = available.find((art) => art.id === selectedId);
  function confirmArtwork(art: Artwork) {
    const matchingIds = art.variantIds ?? [art.variantId];
    const retainedVariant = art.id === currentId && currentVariantId && matchingIds.includes(currentVariantId) ? currentVariantId : undefined;
    const matchedVariant = variantId === 'all' ? retainedVariant ?? candidate.variants.find((variant) => matchingIds.includes(variant.id))?.id ?? candidate.variants[0].id : variantId;
    onChoose(art, matchedVariant, adjustmentFor(art));
  }
  return <><Modal language={language} className="art-modal" title={t.artTitle} onClose={onClose} onClickCapture={(event) => {
    const card = event.target instanceof Element ? event.target.closest('.art-card') : null;
    // Native double-click counts can include the click that opened this picker.
    const canConfirm = card !== null && event.detail === 2 && lastClick.current?.card === card && lastClick.current.detail === 1;
    lastClick.current = { card, detail: event.detail, canConfirm };
  }}>
    <div className="art-intro"><div className="art-ship-identity"><button className="text-button art-back-button" onClick={onBack}><ChevronLeft size={16}/>{t.backShips}</button><Image src={candidate.ship.image} alt="" /><div><strong>{candidate.ship.names[language]}</strong><span>{shipTypes.map((type) => type.names[language]).join(' / ')} · {shipTypes.map((type) => type.id).join(' / ')}</span></div></div><p>{t.artIntro}</p></div>
    <div className="art-filters">
      <StyledSelect label={t.remodel} value={variantId} options={[{ value: 'all', label: t.allForms }, ...candidate.variants.map((variant) => ({ value: variant.id, label: variant.names[language] }))]} onChange={(value) => { setVariantId(value); setSelectedId(''); }} />
      <div className="filter-row" role="group" aria-label={t.allArt}>
        {[['all', t.allArt], ['standard', t.standard], ['seasonal', t.seasonal]].map(([value, label]) => <button key={value} className={`chip ${kind === value ? 'active' : ''}`} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
      </div>
      <div className="filter-row" role="group" aria-label={t.allDamage}>
        {[['all', t.allDamage], ['normal', t.normal], ['damaged', t.damaged]].map(([value, label]) => <button key={value} className={`chip ${damage === value ? 'active' : ''}`} aria-pressed={damage === value} onClick={() => setDamage(value)}>{label}</button>)}
        <span className="result-count">{localizedCount(filtered.length, 'artworks', language)}</span>
      </div>
    </div>
    <div className="art-gallery modal-scroll">
      {filtered.length ? filtered.map((art) => <button key={art.id} className={`art-card ${selectedId === art.id ? 'chosen' : ''}`} aria-label={`${art.names[language]} · ${art.damage === 'damaged' ? t.damaged : t.normal}`} aria-pressed={selectedId === art.id} onClick={() => setSelectedId(art.id)} onDoubleClick={(event) => {
        if (lastClick.current?.canConfirm && lastClick.current.card === event.currentTarget) confirmArtwork(art);
      }}>
        <div className="art-picture"><Image src={art.thumbnail ?? art.image} alt={art.names[language]} /><span className={`damage-badge ${art.damage}`}>{art.damage === 'damaged' ? t.damaged : t.normal}</span>{selectedId === art.id && <span className="art-check"><Check size={18}/></span>}</div>
        <span className="art-name">{art.names[language]}</span><span className="art-kind">{art.kind === 'seasonal' ? t.seasonal : t.standard}</span>
      </button>) : <div className="empty-results"><ImageIcon size={30}/><strong>{t.noArt}</strong><p>{t.noArtHint}</p><button className="text-button" onClick={() => { setKind('all'); setDamage('all'); }}>{t.allArt}</button></div>}
    </div>
    <div className="art-footer"><div className="art-selection">{selected ? <strong>{selected.names[language]}</strong> : <span>{t.artTitle}</span>}</div><div className="art-footer-actions"><button className="secondary-button" disabled={!selected} onClick={() => setEditing(selected ?? null)}><Move size={16}/>{t.adjustAvatar}</button><button className="primary-button" disabled={!selected} onClick={() => { if (selected) confirmArtwork(selected); }}><Check size={17}/>{t.useArt}</button></div></div>
  </Modal><ModalPresence>{editing && <AvatarEditor key={editing.id} image={editing.image} name={candidate.ship.names[language]} language={language} base={crops[editing.image]} adjustment={adjustmentFor(editing)} onClose={() => setEditing(null)} onApply={(avatar) => { setAdjustments((current) => ({ ...current, [editing.id]: avatar })); setEditing(null); }}/>}</ModalPresence></>;
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageForPath(location.pathname));
  const isPickup = page === 'types' || page === 'dd-classes';
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = messages[language];
  const [data, setData] = useState<ShipData | null>(null);
  const [artData, setArtData] = useState<ArtworkData | null>(null);
  const [avatarCrops, setAvatarCrops] = useState<AvatarCropData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [board, setBoard] = useState<SavedBoard>(EMPTY);
  const [workspaceMode, setWorkspaceMode] = useState<'selection' | 'layout'>('selection');
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TypeId | SlotId | 'all'>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [chooser, setChooser] = useState<SlotId | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [artTarget, setArtTarget] = useState<Candidate | null>(null);
  const [cropTarget, setCropTarget] = useState<SlotId | null>(null);
  const [active, setActive] = useState<Candidate | null>(null);
  const [dragOver, setDragOver] = useState<SlotId | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [missingNicknameOpen, setMissingNicknameOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [toast, setToast] = useState('');
  const filterScroll = useRef<HTMLDivElement>(null);
  const libraryScroll = useRef<HTMLDivElement>(null);
  const loadMoreSentinel = useRef<HTMLDivElement>(null);
  const candidates = useMemo(() => candidatesFor(data?.ships ?? []), [data]);
  const artworkMap = useMemo(() => new Map((artData?.artworks ?? []).map((art) => [art.id, art])), [artData]);
  const mode = page === 'dd-classes' ? 'dd-classes' : 'types';
  const classMode = mode === 'dd-classes';
  const slots = useMemo(() => boardSlots(data?.ships ?? [], mode), [data, mode]);
  const layout = useMemo(() => cleanBoardLayout(board.layout, slots), [board.layout, slots]);
  const selectable = useMemo(() => candidates.filter((candidate) => slots.some((slot) => matchesSlot(candidate, slot.id))), [candidates, slots]);
  const count = slots.filter((slot) => board.picks[slot.id]).length;
  const introTitle = page === 'home' ? t.homeTitle : page === 'not-found' ? t.notFound : classMode ? t.ddClassTitle : t.introTitle;
  const instruction = classMode ? t.ddClassInstruction : t.instruction;
  const chooserSlot = slots.find((slot) => slot.id === chooser);
  const artSlot = artTarget ? slotFor(artTarget, mode) : undefined;
  const currentArtPick = artSlot ? board.picks[artSlot] : undefined;
  const libraryFilters = classMode ? slots : SHIP_TYPES;
  const availableArtworkCount = useMemo(() => {
    if (!classMode) return artData?.artworks.length ?? 0;
    const shipIds = new Set(selectable.map((candidate) => candidate.ship.id));
    return artData?.artworks.filter((art) => shipIds.has(art.shipId)).length ?? 0;
  }, [classMode, artData, selectable]);
  const allExportCards = useMemo(() => slots.map((group) => {
    const { ship, variant, name, image, crop } = boardImage(group.id);
    const typeName = SHIP_TYPES.find((type) => type.id === variant?.typeId)?.names[language];
    return { slotId: group.id, groupId: classMode ? group.names[language] : group.code, icon: group.icon,
      groupName: classMode ? shipClassOrdinal(ship?.classNumber, language)
        : typeName ?? group.names[language], name, image, crop };
  }), [slots, board.picks, data, artworkMap, avatarCrops, language, classMode]);
  const exportCards = useMemo(() => {
    const cards = new Map(allExportCards.map((card) => [card.slotId, card]));
    return arrangedBoardSlots(slots, layout).map((slot) => cards.get(slot.id)!);
  }, [slots, layout, allExportCards]);
  const exportOptions = useMemo(() => {
    const nickname = board.nickname.trim();
    return { nickname: nickname ? t.exportOwner.replace('{name}', () => nickname) : t.exportAnonymousOwner,
      title: introTitle, subtitle: classMode ? t.ddClassExport : t.exportSubtitle, brand: t.brand,
      footer: location.host, emptyLabel: t.empty, cards: exportCards, columns: layout.columns };
  }, [board.nickname, t, introTitle, classMode, exportCards, layout.columns]);

  useEffect(() => {
    const controller = new AbortController(); setError(false);
    Promise.all(['/data/ships.json', '/data/artworks.json', '/data/avatar-crops.json'].map(async (url) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Data unavailable');
      return response.json();
    })).then(([rawShipData, rawArtworkData, rawAvatarData]) => {
      const shipData = rawShipData as ShipData;
      const artworkData = rawArtworkData as ArtworkData;
      if (!Array.isArray(shipData.ships) || !Array.isArray(artworkData.artworks)) throw new Error('Invalid data');
      setData(shipData); setArtData(artworkData); setAvatarCrops(rawAvatarData as AvatarCropData);
      let saved = EMPTY;
      try { saved = cleanBoard(JSON.parse(localStorage.getItem(classMode ? CLASS_STORAGE_KEY : STORAGE_KEY) ?? (classMode ? localStorage.getItem(STORAGE_KEY) : null) ?? 'null'), shipData.ships); } catch { /* Use empty board. */ }
      let restoredShare = false;
      if (location.hash.startsWith('#p=')) {
        const shared = decodeBoard(location.hash.slice(3), shipData.ships);
        if (shared) {
          saved = shared; restoredShare = true;
          const sharedMode = shared.mode ?? 'types';
          const url = new URL(location.href); url.pathname = PICKUP_PATHS[sharedMode];
          history.replaceState(null, '', url); setPage(sharedMode);
        }
        const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url);
      }
      if (isPickup || restoredShare) saved = boardForMode(saved, restoredShare ? saved.mode ?? 'types' : mode);
      setBoard(cleanArtworkBoard(saved, artworkData.artworks)); setReady(true);
    }).catch((error: Error) => { if (error.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    document.documentElement.lang = { zh: 'zh-CN', ja: 'ja', en: 'en' }[language];
    document.title = page === 'home' ? t.brand : `${introTitle} | ${t.brand}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.siteDescription);
    try { localStorage.setItem('chinjufu-language', language); } catch { /* Optional. */ }
    const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(null, '', url);
  }, [language, page, introTitle, t.brand, t.siteDescription]);
  useEffect(() => { if (ready && isPickup) { try { localStorage.setItem(classMode ? CLASS_STORAGE_KEY : STORAGE_KEY, JSON.stringify(boardForMode(board, mode))); } catch { /* Optional. */ } } }, [board, ready, isPickup, classMode, mode]);
  useEffect(() => {
    if (!ready || !data || !artData) return;
    const restoreShared = () => {
      if (!location.hash.startsWith('#p=')) return;
      const shared = decodeBoard(location.hash.slice(3), data.ships);
      if (shared) {
        const sharedMode = shared.mode ?? 'types';
        const target = new URL(location.href); target.pathname = PICKUP_PATHS[sharedMode];
        history.replaceState(null, '', target); setPage(sharedMode);
        setFilter('all'); setSearch(''); setDragOver(null); setWorkspaceMode('selection');
        setBoard(cleanArtworkBoard(shared, artData.artworks));
        setShareUrl(''); setChooser(null); setArtTarget(null); setCropTarget(null); setActive(null);
        setToast(t.restored);
      }
      const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url);
    };
    window.addEventListener('hashchange', restoreShared);
    restoreShared();
    return () => window.removeEventListener('hashchange', restoreShared);
  }, [ready, data, artData, t.restored]);
  useEffect(() => {
    setLimit(PAGE_SIZE);
    libraryScroll.current?.scrollTo({ top: 0 });
  }, [search, filter, mode, language]);
  useEffect(() => { if (toast) { const timeout = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timeout); } }, [toast]);
  useEffect(() => { if (preview) return () => URL.revokeObjectURL(preview); }, [preview]);

  const filtered = useMemo(() => {
    const collator = new Intl.Collator({ zh: 'zh-CN', ja: 'ja', en: 'en' }[language], { numeric: true });
    const matching = selectable.filter((candidate) => (filter === 'all' || (classMode ? matchesSlot(candidate, filter as SlotId) : candidate.variants.some((variant) => variant.typeId === filter))) && matchesSearch(candidate, search));
    return classMode ? candidatesByClass(matching, language).flatMap((group) => group.candidates) : matching.sort((a, b) => collator.compare(a.ship.names[language], b.ship.names[language]));
  }, [selectable, classMode, filter, search, language]);
  useEffect(() => {
    const root = libraryScroll.current;
    const sentinel = loadMoreSentinel.current;
    if (!ready || !isPickup || !root || !sentinel || limit >= filtered.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => Math.min(current + PAGE_SIZE, filtered.length));
    }, { root, rootMargin: '0px 0px 160px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [ready, isPickup, limit, filtered]);
  const modalCandidates = selectable.filter((candidate) => chooser && matchesSlot(candidate, chooser) && matchesSearch(candidate, modalSearch));

  function openChooser(typeId: SlotId) { setModalSearch(''); setChooser(typeId); setActive(null); }
  function openArt(candidate: Candidate) {
    if (!selectable.some((item) => item.key === candidate.key)) { setToast(classMode ? t.wrongClass : t.wrongType); return; }
    setArtTarget(candidate); setActive(candidate);
  }
  function switchWorkspace(next: 'selection' | 'layout') {
    setWorkspaceMode(next); setActive(null); setDragOver(null);
  }
  function exportAction() {
    if (workspaceMode === 'selection') switchWorkspace('layout');
    else void saveImage();
  }
  function chooseArtwork(art: Artwork, variantId: string, avatar?: AvatarAdjustment) {
    if (!artTarget || !artSlot) return;
    setBoard((current) => ({ ...current, picks: { ...current.picks, [artSlot]: {
      shipId: artTarget.ship.id, variantId, ...(art.id.startsWith('fallback-') ? {} : { artworkId: art.id }), ...(avatar ? { avatar } : {}),
      ...(current.picks[artSlot]?.shipId === artTarget.ship.id && current.picks[artSlot]?.useOriginalName ? { useOriginalName: true } : {}),
    } } }));
    setArtTarget(null); setChooser(null); setActive(null);
  }
  function removePick(typeId: SlotId) { setBoard((current) => { const picks: Picks = { ...current.picks }; delete picks[typeId]; return { ...current, picks }; }); }
  function boardImage(typeId: SlotId) {
    const pick = board.picks[typeId]; const variant = findVariant(data?.ships ?? [], pick);
    const ship = data?.ships.find((ship) => ship.id === pick?.shipId);
    const name = ship && variant ? shipDisplayName(ship, variant, language, pick?.useOriginalName) : undefined;
    const art = pick?.artworkId ? artworkMap.get(pick.artworkId) : undefined;
    const base = art ? avatarCrops?.images[art.image] : undefined;
    const image = art && (base?.rect || pick?.avatar?.image === art.image) ? art.image : variant?.image;
    const crop = image ? resolveAvatarCrop(image, avatarCrops?.images[image], pick?.avatar) : undefined;
    return { ship, variant, name, art, crop, image };
  }
  function dropShip(event: React.DragEvent, typeId: SlotId) {
    event.preventDefault(); setDragOver(null); setActive(null);
    const key = event.dataTransfer.getData('application/chinjufu-ship');
    const candidate = candidates.find((candidate) => candidate.key === key);
    if (!candidate) return;
    if (!matchesSlot(candidate, typeId)) { setToast(classMode ? t.wrongClass : t.wrongType); return; }
    openArt(candidate);
  }
  async function saveImage(allowUnnamed = false) {
    if (saving || !exportCards.length) return;
    const nickname = board.nickname.trim();
    if (!nickname && !allowUnnamed) { setMissingNicknameOpen(true); return; }
    setSaving(true);
    try {
      const blob = await exportBoard(exportOptions);
      const url = URL.createObjectURL(blob); setPreview(url); setToast(t.saved);
    } catch { setToast(t.exportFailed); }
    finally { setSaving(false); }
  }
  async function share() {
    const url = new URL(PICKUP_PATHS[mode], location.origin); url.searchParams.set('lang', language); url.hash = `p=${encodeBoard(boardForMode(board, mode))}`;
    setShareUrl(url.href);
    try { await navigator.clipboard.writeText(url.href); setToast(t.copied); } catch { /* Dialog provides manual copy. */ }
  }
  function renderShip(candidate: Candidate, modal = false) {
    const slot = slotFor(candidate, mode);
    const picked = slot && board.picks[slot]?.shipId === candidate.ship.id;
    const categoryName = classMode ? candidate.ship.className?.[language] : candidateShipTypes(candidate).map((type) => type.names[language]).join(' / ');
    return <button key={candidate.key} className={`ship-card ${active?.key === candidate.key ? 'active' : ''} ${picked ? 'picked' : ''}`} onClick={() => openArt(candidate)} draggable={!modal}
      onDragStart={(event) => { event.dataTransfer.setData('application/chinjufu-ship', candidate.key); event.dataTransfer.effectAllowed = 'copy'; setActive(candidate); }}
      onDragEnd={() => { setActive(null); setDragOver(null); }}
      aria-label={`${candidate.ship.names[language]} · ${categoryName} · ${t.chooseArt}`}>
      <Image src={candidate.ship.image} alt="" /><span className="ship-card-text"><strong>{candidate.ship.names[language]}</strong><small title={categoryName}>{categoryName}</small></span>
      {picked ? <CheckCircle2 className="ship-status" size={16}/> : modal ? <ChevronRight className="ship-status" size={15}/> : <GripVertical className="ship-grip" size={16}/>}
    </button>;
  }

  const cropDetails = cropTarget ? boardImage(cropTarget) : undefined;
  const dataUpdateDate = [data?.updatedAt, artData?.updatedAt].filter((value): value is string => Boolean(value)).sort().at(-1)?.slice(0, 10).replaceAll('-', '.');
  function renderFooter() {
    return <footer className="site-footer"><div><strong>{t.brand}</strong><p>{t.fan}</p><p className="copyright">{t.rights}</p></div><div className="footer-links"><div className="footer-meta"><div className="footer-version"><button onClick={() => setAboutOpen(true)}><Info size={13}/>{t.source}</button><span><b>v1.2</b>{dataUpdateDate && <> · {t.dataLastUpdated.replace('{date}', dataUpdateDate)}</>}</span></div><div className="footer-credit"><a href="https://github.com/Kutinana/chinjufu-pick" target="_blank" rel="noreferrer">GitHub</a><span aria-hidden="true">·</span><span>{t.creatorCredit.replace('{name}', 'Kuchinashi Hoshikawa')}</span></div></div></div></footer>;
  }
  function homePortraits(names: string[]) {
    return names.map((name) => data?.ships.find((ship) => ship.names.en === name)).filter((ship) => Boolean(ship));
  }
  // Render the homepage hero immediately; template portraits fill in when catalogs arrive.
  return <>
    <header className="site-header"><div className="header-inner">
      <a href={`/?lang=${language}`} className="brand" aria-label={t.brand}><Anchor size={22}/><span>{t.brand}</span></a>
      <span className="header-title">{t.title}</span>
      <div className="header-actions"><StyledSelect className="language-select" label={t.language} hideLabel icon={<Globe2 size={17}/>} value={language} options={[{ value: 'zh', label: '中文' }, { value: 'ja', label: '日本語' }, { value: 'en', label: 'English' }]} onChange={(value) => setLanguage(value as Language)}/>
        {isPickup && <button className="primary-button header-save" onClick={exportAction} disabled={!ready || saving || (workspaceMode === 'layout' && !exportCards.length)}>{saving ? <LoaderCircle className="spin" size={17}/> : workspaceMode === 'selection' ? <LayoutGrid size={17}/> : <Download size={17}/>}<span>{saving ? t.saving : workspaceMode === 'selection' ? t.goToLayout : t.save}</span></button>}
      </div>
    </div></header>
    {!ready && page !== 'home' ? <main className="loading-state"><Anchor size={42}/><h1>{t.brand}</h1>{error ? <><p>{t.loadFailed}</p><button className="primary-button" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={16}/>{t.retry}</button></> : <><LoaderCircle className="spin" size={22}/><p>{t.loading}</p></>}</main> : page === 'home' ? <main className="page home-page">
      <section className="home-hero"><div className="home-hero-copy"><h1>{t.homeTitle}</h1><p>{t.homeIntro}</p></div><div className="home-hero-art" aria-hidden="true">
        <img src={homeHeroMedium} srcSet={`${homeHeroSmall} 480w, ${homeHeroMedium} 800w, ${homeHeroLarge} 1200w`}
          sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 950px) calc(57.5vw - 51.75px), (max-width: 1240px) calc(57.5vw - 60.95px), 652px"
          alt="" width={1920} height={1353} fetchPriority="high" decoding="async"/>
      </div></section>
      <section className="pickup-templates" aria-label={t.pickupTemplates}>
        {(['types', 'dd-classes'] as const).map((template, index) => <a key={template} className="pickup-template" href={`${PICKUP_PATHS[template]}?lang=${language}`}>
          <div className="template-preview" aria-hidden="true">{homePortraits(template === 'types' ? ['Yukikaze', 'Kitakami', 'Yamato'] : ['Shigure', 'Shimakaze', 'Akizuki']).map((ship) => ship && <div className="template-mini-card" key={ship.id}><img className="mini-icon" src={GROUPS.find((group) => group.id === ship.typeId)?.icon ?? GROUPS[0].icon} alt=""/><img className="mini-portrait" src={ship.image} alt=""/><span>{template === 'types' ? SHIP_TYPES.find((type) => type.id === ship.typeId)?.names[language] : ship.className?.[language]}</span></div>)}</div>
          <div className="template-copy"><span className="template-number">0{index + 1}</span><h2>{template === 'types' ? t.introTitle : t.ddClassTitle}</h2><p>{template === 'types' ? t.typeTemplateDescription : t.classTemplateDescription}</p><span className="template-open">{t.startPicking}<ChevronRight size={16}/></span></div>
        </a>)}
      </section>{renderFooter()}
    </main> : page === 'not-found' ? <main className="page"><div className="loading-state"><h1>{t.notFound}</h1><a className="text-button" href={`/?lang=${language}`}>{t.home}</a></div>{renderFooter()}</main> : <>
      <main className="page">
        <a className="text-button pickup-back" href={`/?lang=${language}`}><ChevronLeft size={15}/>{t.home}</a>
        <section className="intro"><div className="intro-heading"><h1>{introTitle}</h1></div><p className="intro-instruction">{workspaceMode === 'layout' ? t.layoutIntro : instruction}</p><div className="intro-profile"><label className="sr-only" htmlFor="nickname">{t.nickname}</label><input id="nickname" maxLength={24} value={board.nickname} placeholder={t.nicknamePlaceholder} onChange={(event) => setBoard((current) => ({ ...current, nickname: event.target.value }))}/><div className="progress-count"><strong>{count}</strong><span>/{slots.length}</span><small>{t.selected}</small></div><div className="progress-track"><span style={{ width: `${count / Math.max(1, slots.length) * 100}%` }}/></div></div>
          <div className="workspace-tabs" role="tablist" aria-label={t.workspaceTabs} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'selection' : event.key === 'End' ? 'layout' : workspaceMode === 'selection' ? 'layout' : 'selection';
          switchWorkspace(next); document.getElementById(`${next}-tab`)?.focus();
        }}>
          <button id="selection-tab" role="tab" aria-selected={workspaceMode === 'selection'} aria-controls="selection-panel" tabIndex={workspaceMode === 'selection' ? 0 : -1} onClick={() => switchWorkspace('selection')}><Anchor size={16}/>{t.selectionTab}</button>
          <button id="layout-tab" role="tab" aria-selected={workspaceMode === 'layout'} aria-controls="layout-panel" tabIndex={workspaceMode === 'layout' ? 0 : -1} onClick={() => switchWorkspace('layout')}><LayoutGrid size={16}/>{t.layoutTab}</button>
        </div>
        </section>
        <div id="selection-panel" role="tabpanel" aria-labelledby="selection-tab" hidden={workspaceMode !== 'selection'} tabIndex={0}><div className="workspace">
          <section className="board-panel panel" aria-labelledby="board-title"><div className="section-header"><h2 id="board-title"><LayoutGrid className="section-icon" size={18} aria-hidden="true"/>{t.board}</h2><button className="text-button muted" onClick={() => count ? setResetOpen(true) : setActive(null)}><RotateCcw size={15}/>{t.reset}</button></div>
            <div className="board-grid">{slots.map((group) => {
              const { ship, variant, name, image, crop } = boardImage(group.id);
              const renamed = ship && variant && shipDisplayName(ship, variant, 'en') !== ship.names.en;
              const candidate = selectable.find((candidate) => candidate.ship.id === board.picks[group.id]?.shipId && matchesSlot(candidate, group.id));
              return <div className="board-item" key={group.id}><div className="type-identity"><TypeMark icon={group.icon}/><span title={group.names[language]}>{group.names[language]}</span><small title={group.code}>{group.code}</small></div>
                <div className={`slot-frame ${variant ? 'filled' : ''} ${dragOver === group.id ? 'drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragOver(group.id); }} onDragLeave={() => setDragOver(null)} onDrop={(event) => dropShip(event, group.id)}>
                  <button className="slot-main" aria-label={`${group.names[language]} · ${variant ? `${name} · ${t.editArt}` : t.choose}`} onClick={() => {
                    if (active) { if (matchesSlot(active, group.id)) openArt(active); else setToast(classMode ? t.wrongClass : t.wrongType); }
                    else if (candidate) openArt(candidate); else openChooser(group.id);
                  }}>{variant && image ? <><Avatar src={image} alt={name ?? ''} crop={crop}/><span className="picked-name">{name}</span></> : <span className="slot-placeholder"><span className="plus-circle"><Plus size={19}/></span><strong>{t.choose}</strong><small>{t.tapSearch}</small></span>}</button>
                  {variant && <button className="remove-pick" aria-label={`${t.clear} · ${group.names[language]}`} onClick={() => removePick(group.id)}><X size={14}/></button>}
                </div>
                {variant && <div className="slot-actions"><button onClick={() => setCropTarget(group.id)}><Move size={11}/>{t.adjustAvatar}</button></div>}
                {renamed && <label className="original-name-switch"><input type="checkbox" role="switch" checked={board.picks[group.id]?.useOriginalName === true} onChange={(event) => {
                  const checked = event.target.checked;
                  setBoard((current) => { const pick = current.picks[group.id]; if (!pick) return current;
                    const { useOriginalName: _previous, ...rest } = pick;
                    return { ...current, picks: { ...current.picks, [group.id]: { ...rest, ...(checked ? { useOriginalName: true } : {}) } } };
                  });
                }}/><span>{t.useOriginalName}</span></label>}
              </div>;
            })}</div>
            <div className="board-footnote"><CheckCircle2 size={13}/><span>{t.autosaved}</span><button className="text-button" onClick={share}><Share2 size={13}/>{t.share}</button></div>
          </section>
          <aside className="library-panel panel" aria-labelledby="library-title"><div className="section-header"><h2 id="library-title"><List className="section-icon" size={18} aria-hidden="true"/>{t.library}</h2><span className="result-count">{localizedCount(classMode ? selectable.length : data?.ships.length ?? 0, 'ships', language)}</span></div>
            <div className="library-controls"><div className="search-field"><Search size={18}/><input aria-label={t.search} placeholder={t.search} value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button className="icon-button" aria-label={t.clearSearch} onClick={() => setSearch('')}><X size={15}/></button>}</div>
              <div className="filter-strip"><button className="filter-arrow" aria-label={t.previousFilters} onClick={() => filterScroll.current?.scrollBy({ left: -180, behavior: 'smooth' })}><ChevronLeft size={16}/></button><div ref={filterScroll} className="type-filters" role="group" aria-label={classMode ? t.classLabel : t.countLabel}><button className={`chip ${filter === 'all' ? 'active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t.all}</button>{libraryFilters.map((group) => <button key={group.id} className={`chip ${filter === group.id ? 'active' : ''}`} aria-pressed={filter === group.id} title={group.names[language]} onClick={() => setFilter(group.id)}>{group.names[language]}</button>)}</div><button className="filter-arrow" aria-label={t.nextFilters} onClick={() => filterScroll.current?.scrollBy({ left: 180, behavior: 'smooth' })}><ChevronRight size={16}/></button></div>
            </div>
            <div className="library-scroll" ref={libraryScroll}>{classMode ? candidatesByClass(filtered.slice(0, limit), language).map((group) => <section className="class-section" key={group.key}><h3 className="class-heading"><span>{group.names[language]}</span><small>{group.candidates.length}</small></h3><div className="ship-list">{group.candidates.map((candidate) => renderShip(candidate))}</div></section>) : <div className="ship-list">{filtered.slice(0, limit).map((candidate) => renderShip(candidate))}</div>}
              {!filtered.length && <div className="empty-results"><Search size={28}/><strong>{t.noResults}</strong><p>{t.trySearch}</p><button className="text-button" onClick={() => { setSearch(''); setFilter('all'); }}>{t.clearSearch}</button></div>}
              {filtered.length > limit && <div className="library-load-sentinel" ref={loadMoreSentinel} aria-hidden="true"/>}
            </div>
            <div className="library-footer"><ImageIcon size={13}/><span>{t.chooseArt}</span><span>{localizedCount(availableArtworkCount, 'artworks', language)}</span></div>
          </aside>
        </div></div>
        <div id="layout-panel" role="tabpanel" aria-labelledby="layout-tab" hidden={workspaceMode !== 'layout'} tabIndex={0}>
          {workspaceMode === 'layout' && <ExportLayout slots={slots} layout={layout} cards={allExportCards} exportOptions={exportOptions} language={language} saving={saving}
            onChange={(next) => setBoard((current) => ({ ...current, layout: cleanBoardLayout(next, slots) }))} onExport={() => void saveImage()} onShare={() => void share()}/>}
        </div>
        {renderFooter()}
      </main>
      <div className="mobile-save"><span><strong>{workspaceMode === 'layout' ? exportCards.length : count}</strong>{workspaceMode === 'layout' ? ` ${t.visibleSlots}` : ` /${slots.length} ${t.selected}`}</span><button className="primary-button" disabled={saving || (workspaceMode === 'layout' && !exportCards.length)} onClick={exportAction}>{saving ? <LoaderCircle className="spin" size={17}/> : workspaceMode === 'selection' ? <LayoutGrid size={17}/> : <Download size={17}/>} {saving ? t.saving : workspaceMode === 'selection' ? t.goToLayout : t.save}</button></div>
    </>}
    <ModalPresence>{chooserSlot && <Modal language={language} title={`${t.chooseFor}${chooserSlot.names[language]}`} onClose={() => setChooser(null)}><div className="modal-search search-field"><Search size={18}/><input autoFocus aria-label={t.search} value={modalSearch} placeholder={t.search} onChange={(event) => setModalSearch(event.target.value)}/></div><div className="chooser-list modal-scroll">{candidatesByClass(modalCandidates, language).map((group) => <section className="class-section" key={group.key} aria-label={group.names[language]}><h3 className="class-heading"><span>{group.names[language]}</span><small>{group.candidates.length}</small></h3><div className="ship-list">{group.candidates.map((candidate) => renderShip(candidate, true))}</div></section>)}{!modalCandidates.length && <div className="empty-results"><Search size={25}/><strong>{t.noResults}</strong><p>{t.trySearch}</p></div>}</div></Modal>}</ModalPresence>
    <ModalPresence>{artTarget && <ArtworkPicker key={artTarget.key} candidate={artTarget} artworks={artData?.artworks ?? []} language={language} crops={avatarCrops?.images ?? {}} currentAvatar={currentArtPick?.shipId === artTarget.ship.id ? currentArtPick.avatar : undefined} currentId={currentArtPick?.shipId === artTarget.ship.id ? currentArtPick?.artworkId : undefined} currentVariantId={currentArtPick?.shipId === artTarget.ship.id ? currentArtPick?.variantId : undefined} onClose={() => { setArtTarget(null); setActive(null); }} onBack={() => { if (!chooser && artSlot) openChooser(artSlot); setArtTarget(null); setActive(null); }} onChoose={chooseArtwork}/>}</ModalPresence>
    <ModalPresence>{cropTarget && cropDetails?.image && <AvatarEditor key={`${cropTarget}:${cropDetails.image}`} image={cropDetails.image} name={cropDetails.name ?? ''} language={language} base={avatarCrops?.images[cropDetails.image]} adjustment={board.picks[cropTarget]?.avatar} onClose={() => setCropTarget(null)} onApply={(avatar) => {
      setBoard((current) => { const pick = current.picks[cropTarget]; return pick ? { ...current, picks: { ...current.picks, [cropTarget]: { ...pick, avatar } } } : current; }); setCropTarget(null);
    }}/>}</ModalPresence>
    <ModalPresence>{missingNicknameOpen && <Modal language={language} className="small-modal" title={t.missingNicknameTitle} onClose={() => setMissingNicknameOpen(false)}><p className="modal-copy">{t.missingNicknameBody}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => {
      setMissingNicknameOpen(false);
      // Focus after the closing modal has restored its previous focus target.
      window.setTimeout(() => document.getElementById('nickname')?.focus(), MODAL_EXIT_MS + 20);
    }}>{t.enterNickname}</button><button className="primary-button" disabled={saving} onClick={() => { setMissingNicknameOpen(false); void saveImage(true); }}>{t.continueExport}</button></div></Modal>}</ModalPresence>
    <ModalPresence>{resetOpen && <Modal language={language} className="small-modal" title={t.resetTitle} onClose={() => setResetOpen(false)}><p className="modal-copy">{t.resetBody}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setResetOpen(false)}>{t.cancel}</button><button className="primary-button" onClick={() => { setBoard((current) => ({ ...current, picks: Object.fromEntries(Object.entries(current.picks).filter(([key]) => key.startsWith('DD:') !== classMode)) as Picks })); setActive(null); setResetOpen(false); }}>{t.confirm}</button></div></Modal>}</ModalPresence>
    <ModalPresence>{preview && <Modal language={language} className="preview-modal" title={t.imagePreview} onClose={() => setPreview('')}><div className="preview-image modal-scroll"><img src={preview} alt={classMode ? t.ddClassExport : t.exportSubtitle}/></div><div className="art-footer"><span>{t.previewHint}</span><a className="primary-button" href={preview} download={`chinjufu-pick-${board.nickname || 'admiral'}-${classMode ? 'destroyer-class' : 'ship-type'}.png`}><Download size={17}/>{t.download}</a></div></Modal>}</ModalPresence>
    <ModalPresence>{shareUrl && <Modal language={language} className="small-modal" title={t.shareTitle} onClose={() => setShareUrl('')}><p className="modal-copy">{t.shareHint}</p><input className="share-url" aria-label={t.shareTitle} readOnly value={shareUrl} onFocus={(event) => event.target.select()}/><div className="dialog-actions"><button className="primary-button" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setToast(t.copied); } catch { setToast(t.copyFailed); } }}><Share2 size={16}/>{t.copy}</button></div></Modal>}</ModalPresence>
    <ModalPresence>{aboutOpen && <Modal language={language} className="small-modal" title={t.about} onClose={() => setAboutOpen(false)}><div className="about-content"><Anchor size={32}/><p>{t.sourceNote}</p><p>{t.artNote}</p><h3>{t.source}</h3>{[...(data?.sources ?? []), ...(artData?.sources ?? []), { name: t.sourceSilhouettes, url: 'https://blog.pastime.ne.jp/game/kankore/1473' }, { name: t.sourceHeroVisual, url: 'https://kancolle-itsuumi.com/' }].map((source, index) => <a href={source.url} key={index} target="_blank" rel="noreferrer">{localizedSourceName(source.name, language)}<ExternalLink size={13}/></a>)}<h3>{t.reference}</h3><a href="https://blue-archive-pick.vercel.app/favorite-students" target="_blank" rel="noreferrer">Kivotos Pick <ExternalLink size={13}/></a></div></Modal>}</ModalPresence>
    {toast && <div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    <Analytics />
  </>;
}
