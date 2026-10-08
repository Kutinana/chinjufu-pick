import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportBoard, exportGridGeometry, renderExportBoard } from './export';
import { DEFAULT_LAYOUT_COLUMNS, MAX_LAYOUT_COLUMNS } from './model';

describe('PNG grid geometry', () => {
  it('preserves the original five-column export dimensions by default', () => {
    expect(exportGridGeometry(10)).toEqual({
      columns: DEFAULT_LAYOUT_COLUMNS,
      width: 1000,
      cardWidth: 164,
      cardHeight: 312,
      rows: 2,
      gridHeight: 652,
    });
  });

  it.each([1, 2, 3, 4, 5, 6])('fits %i cards per row without shrinking artwork', (columns) => {
    for (const count of [1, columns, columns + 1, columns * 2, 33]) {
      const geometry = exportGridGeometry(count, columns);
      expect(geometry.columns).toBe(columns);
      expect(geometry.rows).toBe(Math.ceil(count / columns));
      expect(geometry.cardWidth).toBe(164);
      expect(geometry.cardHeight).toBe(312);
      const gridWidth = columns * geometry.cardWidth + (columns - 1) * 16;
      const gridX = (geometry.width - gridWidth) / 2;
      expect(gridX).toBeGreaterThanOrEqual(58);
      for (let index = 0; index < count; index += 1) {
        const right = gridX + (index % columns) * (geometry.cardWidth + 16) + geometry.cardWidth;
        const bottom = Math.floor(index / columns) * (geometry.cardHeight + 28) + geometry.cardHeight;
        expect(right).toBeLessThanOrEqual(geometry.width - 58);
        expect(bottom).toBeLessThanOrEqual(geometry.gridHeight);
      }
    }
  });

  it('keeps narrow exports legible and extends the canvas for six columns', () => {
    expect(exportGridGeometry(10, 1).width).toBe(600);
    expect(exportGridGeometry(10, 2).width).toBe(600);
    expect(exportGridGeometry(10, MAX_LAYOUT_COLUMNS).width).toBe(1180);
  });

  it.each([0, -1, 7, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('uses default columns for invalid value %s', (columns) => {
    expect(exportGridGeometry(10, columns)).toEqual(exportGridGeometry(10));
  });

  it('represents an empty preview without allocating a row', () => {
    const geometry = exportGridGeometry(0, 3);
    expect(geometry.rows).toBe(0);
    expect(geometry.gridHeight).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid card count %s', (count) => {
    expect(() => exportGridGeometry(count)).toThrow('Card count must be a nonnegative integer');
  });

  it('rejects export when all slots are hidden before reading browser resources', async () => {
    await expect(exportBoard({
      nickname: '', title: 'Title', subtitle: '', brand: 'Pick', footer: '', emptyLabel: 'Empty', cards: [],
    })).rejects.toThrow('At least one visible slot is required');
  });
});

describe('PNG rendering layout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([1, 3, 6])('renders cards in %i columns on the matching canvas', async (columns) => {
    const textCalls: Array<{ value: string; x: number; y: number }> = [];
    const imageBars: Array<{ x: number; y: number; width: number }> = [];
    const ctx = {
      measureText: (value: string) => ({ width: value.length * 8 }),
      fillText: (value: string, x: number, y: number) => textCalls.push({ value, x, y }),
      beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
      fillRect: (x: number, y: number, width: number, height: number) => {
        if (height === 3) imageBars.push({ x, y, width });
      },
      fill() {}, save() {}, clip() {}, restore() {}, stroke() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })),
    };
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() }, createElement: () => canvas });
    const cardCount = columns + 1;
    const cards = Array.from({ length: cardCount }, (_, index) => ({ groupId: `S${index}`, groupName: 'Group', name: `Name ${index}` }));
    const rendered = await renderExportBoard({ nickname: 'Owner', title: 'A title long enough to wrap on a narrow canvas and shift the grid down', subtitle: 'Subtitle', brand: 'Pick', footer: 'Footer', emptyLabel: 'Empty', cards, columns });
    const geometry = exportGridGeometry(cardCount, columns);
    expect(rendered.blob.type).toBe('image/png');
    expect(canvas.width).toBe(geometry.width * 2);
    expect(rendered.width * 2).toBe(canvas.width);
    expect(rendered.height * 2).toBe(canvas.height);
    expect(rendered.cards).toHaveLength(cardCount);
    const markers = textCalls.filter((call) => /^S\d+$/u.test(call.value));
    expect(markers).toHaveLength(cardCount);
    expect(markers[columns].x).toBe(markers[0].x);
    expect(markers[columns].y - markers[0].y).toBeCloseTo(geometry.cardHeight + 28);
    if (columns > 1) {
      expect(markers[1].y).toBe(markers[0].y);
      expect(markers[1].x - markers[0].x).toBe(geometry.cardWidth + 16);
    }
    rendered.cards.forEach((bounds, index) => {
      expect(bounds.x + bounds.width / 2).toBe(markers[index].x);
      // These markers have no icon, so the renderer centers the 33px line in a 60px header.
      expect(bounds.y + (60 - 33 * 1.3) / 2).toBeCloseTo(markers[index].y);
      expect(bounds.width).toBe(geometry.cardWidth);
      expect(bounds.height).toBe(geometry.cardHeight);
      expect({ x: bounds.imageX, y: bounds.imageY, width: bounds.imageSize }).toEqual(imageBars[index]);
      expect(bounds.imageX).toBe(bounds.x);
      expect(bounds.imageY).toBe(bounds.y + 68);
      expect(bounds.imageY + bounds.imageSize).toBeLessThan(bounds.y + bounds.height);
    });
    expect(canvas.height / 2).toBeGreaterThan(markers.at(-1)!.y + geometry.cardHeight);
  });
});
