import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Download, GripVertical, LayoutGrid, LoaderCircle, RotateCcw, Share2 } from 'lucide-react';
import { cleanBoardLayout, MAX_LAYOUT_COLUMNS } from './model';
import type { BoardLayout, BoardSlot, Language, SlotId } from './model';
import { renderExportBoard } from './export';
import type { ExportBoardOptions, ExportCard, ExportCardBounds } from './export';
import { messages } from './i18n';
import StyledSelect from './StyledSelect';
import './ExportLayout.css';

type LayoutExportCard = ExportCard & { slotId: SlotId };
type LayoutExportOptions = Omit<ExportBoardOptions, 'cards'> & { cards: LayoutExportCard[] };

interface ExportLayoutProps {
  slots: BoardSlot[];
  layout: BoardLayout;
  cards: LayoutExportCard[];
  exportOptions: LayoutExportOptions;
  language: Language;
  saving: boolean;
  onChange: (layout: BoardLayout) => void;
  onExport: () => void;
  onShare: () => void;
}

type Preview = { url: string; options: LayoutExportOptions; width: number; height: number; bounds: ExportCardBounds[] };
type PreviewStatus = 'pending' | 'ready' | 'error' | 'empty';
type PreviewPointer = {
  slotId: SlotId; pointerId: number; element: HTMLButtonElement; options: LayoutExportOptions;
  startX: number; startY: number; offsetX: number; offsetY: number; width: number; active: boolean;
  bounds: ExportCardBounds;
};
type PreviewDrag = { slotId: SlotId; target: SlotId | null; x: number; y: number; width: number; bounds: ExportCardBounds };

export default function ExportLayout({ slots, layout, cards, exportOptions, language, saving, onChange, onExport, onShare }: ExportLayoutProps) {
  const t = messages[language];
  const id = useId();
  const normalized = useMemo(() => cleanBoardLayout(layout, slots), [layout, slots]);
  const slotMap = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.slotId, card])), [cards]);
  const orderedSlots = normalized.order.flatMap((slotId) => {
    const slot = slotMap.get(slotId);
    return slot ? [slot] : [];
  });
  const hidden = new Set(normalized.hidden);
  const emptyIds = slots.filter((slot) => {
    const card = cardMap.get(slot.id);
    return !card?.image && !card?.name;
  }).map((slot) => slot.id);
  const [dragged, setDragged] = useState<SlotId | null>(null);
  const [dropTarget, setDropTarget] = useState<SlotId | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('pending');
  const [retry, setRetry] = useState(0);
  const previewSurface = useRef<HTMLDivElement>(null);
  const previewPointer = useRef<PreviewPointer | null>(null);
  const [previewDrag, setPreviewDrag] = useState<PreviewDrag | null>(null);
  const columnOptions = Array.from({ length: MAX_LAYOUT_COLUMNS }, (_, index) => index + 1)
    .map((count) => ({ value: String(count), label: t.layoutColumnsOption.replace('{count}', String(count)) }));
  const visibleCount = exportOptions.cards.length;
  const rows = Math.ceil(visibleCount / normalized.columns);
  const summary = t.layoutSummary.replace('{slots}', String(visibleCount)).replace('{rows}', String(rows));
  const defaults = cleanBoardLayout(undefined, slots);
  const isDefault = normalized.columns === defaults.columns
    && !normalized.hidden.length && normalized.order.every((slotId, index) => slotId === defaults.order[index]);

  useEffect(() => {
    if (!exportOptions.cards.length) {
      setStatus('empty');
      setPreview(null);
      return;
    }
    let active = true;
    let pendingUrl: string | null = null;
    setStatus('pending');
    // Use the same options and renderer as the final PNG, after rapid edits settle.
    const timer = window.setTimeout(async () => {
      try {
        const rendered = await renderExportBoard(exportOptions);
        if (!active) return;
        const url = URL.createObjectURL(rendered.blob);
        pendingUrl = url;
        // The interactive bounds must only become active once their bitmap is decoded.
        const image = new window.Image();
        image.src = url;
        await image.decode();
        if (!active) return;
        setPreview({ url, options: exportOptions, width: rendered.width, height: rendered.height, bounds: rendered.cards });
        pendingUrl = null;
        setStatus('ready');
      } catch {
        if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
        if (active) setStatus('error');
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; }
    };
  }, [exportOptions, retry]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    // Any edit invalidates the old picture's hit targets, including an active drag.
    cancelPreviewDrag();
    const onBlur = () => cancelPreviewDrag();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      const pointer = previewPointer.current;
      previewPointer.current = null;
      if (pointer?.element.hasPointerCapture(pointer.pointerId)) pointer.element.releasePointerCapture(pointer.pointerId);
    };
  }, [exportOptions, status]);

  function change(next: BoardLayout) {
    onChange(cleanBoardLayout(next, slots));
  }

  function move(slotId: SlotId, targetIndex: number) {
    const order = [...normalized.order];
    const index = order.indexOf(slotId);
    if (index < 0 || targetIndex < 0 || targetIndex >= order.length || index === targetIndex) return;
    order.splice(index, 1);
    order.splice(targetIndex, 0, slotId);
    change({ ...normalized, order });
  }

  function swapPreviewSlots(source: SlotId, target: SlotId) {
    const order = [...normalized.order];
    const sourceIndex = order.indexOf(source);
    const targetIndex = order.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
    change({ ...normalized, order });
  }

  function endDrag() {
    setDragged(null);
    setDropTarget(null);
  }

  const updating = visibleCount > 0 && status !== 'error' && (status === 'pending' || preview?.options !== exportOptions);
  const previewEditable = status === 'ready' && preview?.options === exportOptions;

  function cancelPreviewDrag(pointerId?: number) {
    const pointer = previewPointer.current;
    if (pointerId !== undefined && pointer?.pointerId !== pointerId) return;
    previewPointer.current = null;
    setPreviewDrag(null);
    if (pointer?.element.hasPointerCapture(pointer.pointerId)) pointer.element.releasePointerCapture(pointer.pointerId);
  }

  function hitPreviewSlot(x: number, y: number): SlotId | null {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layout-slot]');
    const slotId = target?.dataset.layoutSlot as SlotId | undefined;
    return target && previewSurface.current?.contains(target) && slotId
      && exportOptions.cards.some((card) => card.slotId === slotId) ? slotId : null;
  }

  function startPreviewDrag(event: ReactPointerEvent<HTMLButtonElement>, slotId: SlotId, bounds: ExportCardBounds) {
    if (!previewEditable || previewPointer.current || event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    element.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    previewPointer.current = {
      slotId, pointerId: event.pointerId, element, options: exportOptions, bounds,
      startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top, width: rect.width, active: false,
    };
  }

  function movePreviewDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = previewPointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (!previewEditable || pointer.options !== exportOptions) { cancelPreviewDrag(); return; }
    if (!pointer.active && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 6) return;
    pointer.active = true;
    event.preventDefault();
    setPreviewDrag({ slotId: pointer.slotId, target: hitPreviewSlot(event.clientX, event.clientY),
      x: event.clientX - pointer.offsetX, y: event.clientY - pointer.offsetY, width: pointer.width, bounds: pointer.bounds });
  }

  function finishPreviewDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = previewPointer.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const target = previewEditable && pointer.options === exportOptions && pointer.active
      ? hitPreviewSlot(event.clientX, event.clientY) : null;
    cancelPreviewDrag();
    if (target && target !== pointer.slotId) swapPreviewSlots(pointer.slotId, target);
  }

  return <div className="export-layout">
    <section className="panel layout-settings" aria-labelledby={`${id}-settings`}>
      <div className="layout-settings-heading">
        <h2 id={`${id}-settings`}><LayoutGrid size={18} aria-hidden="true" />{t.layoutSettings}</h2>
      </div>
      <div className="layout-grid-settings">
        <StyledSelect className="layout-columns-select" label={t.slotsPerRow} value={String(normalized.columns)} options={columnOptions} onChange={(value) => change({ ...normalized, columns: Number(value) })} />
        <p className="layout-summary">{summary}</p>
      </div>
      <div className="layout-visibility-actions">
        <button className="secondary-button" disabled={!normalized.hidden.length} onClick={() => change({ ...normalized, hidden: [] })}>{t.showAllSlots}</button>
        <button className="secondary-button" disabled={!emptyIds.some((slotId) => !hidden.has(slotId))} onClick={() => change({ ...normalized, hidden: [...normalized.hidden, ...emptyIds] })}>{t.hideEmptySlots}</button>
      </div>
      <div className="layout-order-heading">
        <h3 id={`${id}-order`}>{t.slotOrder}<span>{visibleCount} / {slots.length}</span></h3>
        <p id={`${id}-order-hint`}>{t.slotOrderHint}</p>
      </div>
      <ol className="layout-slot-list" aria-labelledby={`${id}-order`}>
        {orderedSlots.map((slot, index) => {
          const name = slot.names[language];
          const card = cardMap.get(slot.id);
          const isHidden = hidden.has(slot.id);
          const hasPick = Boolean(card?.name || card?.image);
          return <li key={slot.id} className={`layout-slot${isHidden ? ' is-hidden' : ''}${dragged === slot.id ? ' is-dragging' : ''}${dropTarget === slot.id ? ' is-drop-target' : ''}`}
            onDragOver={(event) => {
              if (!dragged || dragged === slot.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTarget(slot.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((target) => target === slot.id ? null : target);
            }}
            onDrop={(event) => {
              if (!dragged) return;
              event.preventDefault();
              move(dragged, index);
              endDrag();
            }}>
            <button type="button" className="layout-drag-handle" draggable tabIndex={-1}
              aria-label={t.moveSlot.replace('{name}', name)} aria-describedby={`${id}-order-hint`}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-chinjufu-slot', slot.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setDragImage(event.currentTarget.parentElement!, 24, 24);
                setDragged(slot.id);
              }}
              onDragEnd={endDrag}>
              <GripVertical size={17} aria-hidden="true" />
            </button>
            <label className="layout-slot-label">
              <input type="checkbox" checked={!isHidden} aria-label={t.slotVisible.replace('{name}', name)} onChange={(event) => change({
                ...normalized,
                hidden: event.target.checked ? normalized.hidden.filter((slotId) => slotId !== slot.id) : [...normalized.hidden, slot.id],
              })} />
              <span className="layout-slot-content">
                <span className="layout-slot-name"><img src={slot.icon} alt="" aria-hidden="true" /><strong>{name}</strong></span>
                <span className="layout-slot-pick">{card?.name || t.empty}</span>
                {isHidden && <span className="layout-slot-hidden-hint">{hasPick ? t.hiddenSlotRetained : t.hiddenSlot}</span>}
              </span>
            </label>
            <div className="layout-move-buttons">
              <button type="button" aria-label={t.moveSlotUp.replace('{name}', name)} disabled={index === 0} onClick={() => move(slot.id, index - 1)}><ArrowUp size={14} aria-hidden="true" /></button>
              <button type="button" aria-label={t.moveSlotDown.replace('{name}', name)} disabled={index === orderedSlots.length - 1} onClick={() => move(slot.id, index + 1)}><ArrowDown size={14} aria-hidden="true" /></button>
            </div>
          </li>;
        })}
      </ol>
      <div className="layout-reset-row"><button className="text-button" disabled={isDefault} onClick={() => change(defaults)}><RotateCcw size={14} aria-hidden="true" />{t.resetLayout}</button></div>
    </section>

    <section className="panel layout-preview-panel" aria-labelledby={`${id}-preview`}>
      <div className="layout-preview-header">
        <div><h2 id={`${id}-preview`}>{t.layoutPreview}</h2><p>{t.layoutPreviewHint}</p></div>
        <div className="layout-preview-grid-control"><StyledSelect className="layout-columns-select" label={t.slotsPerRow} value={String(normalized.columns)} options={columnOptions} onChange={(value) => change({ ...normalized, columns: Number(value) })} /></div>
        <div className="layout-export-actions">
          <button className="secondary-button" onClick={onShare}><Share2 size={16} aria-hidden="true" />{t.share}</button>
          <button className="primary-button" disabled={saving || !visibleCount} onClick={onExport}>{saving ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{saving ? t.saving : t.save}</button>
        </div>
      </div>
      <div className="layout-preview-meta">
        <span>{summary}</span>
        <span className={`layout-preview-status${status === 'error' ? ' has-error' : ''}`} role="status" aria-live="polite">
          {visibleCount > 0 && (updating ? <><LoaderCircle size={13} className="spin" aria-hidden="true" />{t.layoutPreviewUpdating}</> : status === 'ready' ? <><CheckCircle2 size={13} aria-hidden="true" />{t.layoutPreviewReady}</> : status === 'error' ? t.layoutPreviewFailed : null)}
        </span>
      </div>
      {visibleCount > 0 && status === 'error' && <div className="layout-preview-error"><button className="secondary-button" onClick={() => setRetry((value) => value + 1)}><RotateCcw size={14} aria-hidden="true" />{t.retry}</button></div>}
      <div className={`layout-preview-stage${updating && preview ? ' is-updating' : ''}`} aria-busy={updating}>
        {!visibleCount ? <div className="layout-preview-empty"><LayoutGrid size={38} aria-hidden="true" /><strong>{t.layoutNoVisibleSlots}</strong><p>{t.layoutNoVisibleSlotsHint}</p><button className="secondary-button" onClick={() => change({ ...normalized, hidden: [] })}>{t.showAllSlots}</button></div>
          : preview ? <div className={`layout-preview-canvas${previewEditable ? ' is-editable' : ''}${previewDrag ? ' is-dragging' : ''}`} ref={previewSurface} style={{ aspectRatio: `${preview.width} / ${preview.height}` }}>
            <img className="layout-preview-image" src={preview.url} alt={t.imagePreview} draggable={false} />
            <div className="layout-preview-overlays">
              {preview.options.cards.map((card, index) => {
                const bounds = preview.bounds[index];
                if (!bounds) return null;
                const name = slotMap.get(card.slotId)?.names[language] ?? card.groupName;
                const isSource = previewDrag?.slotId === card.slotId;
                const isTarget = previewDrag?.target === card.slotId && !isSource;
                return <div key={card.slotId} data-layout-slot={card.slotId} className={`layout-preview-card${isSource ? ' is-source' : ''}${isTarget ? ' is-target' : ''}`}
                  style={{ left: `${bounds.x / preview.width * 100}%`, top: `${bounds.y / preview.height * 100}%`, width: `${bounds.width / preview.width * 100}%`, height: `${bounds.height / preview.height * 100}%` }}>
                  <button type="button" className="layout-preview-avatar" tabIndex={-1} aria-label={t.layoutPreviewMoveSlot.replace('{name}', name)} aria-disabled={!previewEditable}
                    style={{ left: `${(bounds.imageX - bounds.x) / bounds.width * 100}%`, top: `${(bounds.imageY - bounds.y) / bounds.height * 100}%`, width: `${bounds.imageSize / bounds.width * 100}%`, height: `${bounds.imageSize / bounds.height * 100}%` }}
                    onPointerDown={(event) => startPreviewDrag(event, card.slotId, bounds)} onPointerMove={movePreviewDrag} onPointerUp={finishPreviewDrag}
                    onPointerCancel={(event) => cancelPreviewDrag(event.pointerId)} onLostPointerCapture={(event) => cancelPreviewDrag(event.pointerId)}
                    onKeyDown={(event) => { if (event.key === 'Escape') cancelPreviewDrag(); }}><span className="layout-avatar-grip" aria-hidden="true"><GripVertical size={13} /></span></button>
                </div>;
              })}
            </div>
            <span className="sr-only" role="status" aria-live="polite">{previewDrag?.target && previewDrag.target !== previewDrag.slotId
              ? t.layoutPreviewDropAt.replace('{name}', slotMap.get(previewDrag.target)?.names[language] ?? '') : ''}</span>
          </div>
            : <div className="layout-preview-placeholder">{status === 'error' ? <LayoutGrid size={32} aria-hidden="true" /> : <LoaderCircle className="spin" size={28} aria-hidden="true" />}<p>{status === 'error' ? t.layoutPreviewFailed : t.layoutPreviewUpdating}</p></div>}
      </div>
    </section>
    {previewDrag && preview && <div className="layout-preview-drag-ghost" aria-hidden="true" style={{ left: previewDrag.x, top: previewDrag.y, width: previewDrag.width, height: previewDrag.width }}>
      <img src={preview.url} alt="" draggable={false} style={{ width: `${preview.width / previewDrag.bounds.imageSize * 100}%`, height: `${preview.height / previewDrag.bounds.imageSize * 100}%`, left: `${-previewDrag.bounds.imageX / previewDrag.bounds.imageSize * 100}%`, top: `${-previewDrag.bounds.imageY / previewDrag.bounds.imageSize * 100}%` }} />
      <GripVertical size={16} />
    </div>}
  </div>;
}
