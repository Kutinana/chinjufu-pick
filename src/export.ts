import type { AvatarCrop } from './model';

export interface ExportCard {
  groupId: string;
  icon?: string;
  groupName: string;
  name?: string;
  image?: string;
  crop?: AvatarCrop;
}

export interface ExportBoardOptions {
  /** First title line. The caller supplies the localized honorific or possessive. */
  nickname: string;
  title: string;
  subtitle: string;
  brand: string;
  footer: string;
  emptyLabel: string;
  cards: ExportCard[];
}

interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  weight: number;
}

const WIDTH = 1000;
const SCALE = 2;
const PADDING = 58;
const COLUMNS = 5;
const COLUMN_GAP = 16;
const ROW_GAP = 28;
const CARD_WIDTH = (WIDTH - PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
const IMAGE_TOP = 68;
const IMAGE_SIZE = CARD_WIDTH;
const CARD_HEIGHT = IMAGE_TOP + IMAGE_SIZE + 12 + 28 + 4 + 36;
const FONT_FAMILY = '"Outfit Variable", "Noto Sans SC", "Noto Sans JP", "Hiragino Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const COLORS = {
  background: '#f7fbfd',
  navy: '#17283e',
  cyan: '#149ed6',
  muted: '#748a99',
  group: '#536c7e',
  empty: '#91a5b2',
  image: '#eef7fb',
  border: '#bfd2dc',
};

function font(ctx: CanvasRenderingContext2D, size: number, weight: number): void {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
}

function graphemes(value: string): string[] {
  // Keep composed characters and emoji sequences together when a long word wraps.
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    const words = paragraph.trim().split(/(\s+)/u).filter(Boolean);
    for (const word of words) {
      // CJK text naturally breaks at characters; Latin words stay together when possible.
      const parts = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)
        || ctx.measureText(word).width > width ? graphemes(word) : [word];
      for (const part of parts) {
        const candidate = line + part;
        if (line.trim() && ctx.measureText(candidate.trimEnd()).width > width) {
          lines.push(line.trim());
          line = part.trimStart();
        } else {
          line = candidate.trimStart();
        }
      }
    }
    lines.push(line.trim());
  }
  return lines;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  width: number,
  size: number,
  minSize: number,
  maxLines: number,
  weight: number,
  lineHeightRatio = 1.3,
): TextLayout {
  let fontSize = size;
  let lines: string[];
  do {
    font(ctx, fontSize, weight);
    lines = wrap(ctx, value, width);
    if (lines.length <= maxLines || fontSize <= minSize) break;
    fontSize = Math.max(minSize, fontSize - 1);
  } while (true);

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = graphemes(lines[maxLines - 1]);
    while (last.length && ctx.measureText(`${last.join('')}…`).width > width) last.pop();
    lines[maxLines - 1] = `${last.join('').trimEnd()}…`;
  }
  return { lines, fontSize, lineHeight: fontSize * lineHeightRatio, weight };
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layout: TextLayout,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = 'center',
): void {
  font(ctx, layout.fontSize, layout.weight);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  layout.lines.forEach((line, index) => ctx.fillText(line, x, y + index * layout.lineHeight));
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 3): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function loadArtwork(card: ExportCard): Promise<HTMLImageElement | undefined> {
  if (!card.image) return undefined;
  const url = new URL(card.image, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error(`Artwork must be hosted on this site: ${card.name || card.groupName}`);
  }
  const image = new Image();
  image.decoding = 'async';
  image.src = url.href;
  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
  } catch (cause) {
    throw new Error(`Unable to load artwork: ${card.name || card.groupName}`, { cause });
  }
  return image;
}

/** Render a 2000px-wide PNG without initiating a download or changing the page. */
export async function exportBoard(options: ExportBoardOptions): Promise<Blob> {
  await document.fonts.ready;
  const images = await Promise.all(options.cards.map(loadArtwork));
  const icons = await Promise.all(options.cards.map((card) => loadArtwork({ ...card, image: card.icon })));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PNG export is unavailable in this browser');

  const contentWidth = WIDTH - PADDING * 2;
  const brand = fitText(ctx, options.brand, contentWidth, 14, 10, 1, 900);
  const nickname = options.nickname.trim()
    ? fitText(ctx, options.nickname.trim(), contentWidth, 42, 24, 1, 700, 1.15)
    : undefined;
  const title = fitText(ctx, options.title, contentWidth, 42, 30, 2, 700, 1.15);
  const subtitle = fitText(ctx, options.subtitle, contentWidth, 15, 12, 2, 400);
  const brandY = 62;
  const titleY = brandY + brand.lineHeight + 12;
  const mainTitleY = titleY + (nickname ? nickname.lineHeight + 2 : 0);
  const subtitleY = mainTitleY + title.lines.length * title.lineHeight + 10;
  const gridY = subtitleY + subtitle.lines.length * subtitle.lineHeight + 40;
  const rows = Math.max(1, Math.ceil(options.cards.length / COLUMNS));
  const gridHeight = rows * CARD_HEIGHT + (rows - 1) * ROW_GAP;
  const footerY = gridY + gridHeight + 34;
  const footer = fitText(ctx, options.footer, contentWidth - 190, 13, 10, 2, 400);
  const height = Math.ceil(footerY + Math.max(brand.lineHeight, footer.lines.length * footer.lineHeight) + 42);
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, height);
  const wash = ctx.createLinearGradient(0, 0, WIDTH * 0.5, height * 0.3);
  wash.addColorStop(0, 'rgba(65, 191, 236, 0.09)');
  wash.addColorStop(1, 'rgba(65, 191, 236, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, height);
  drawText(ctx, brand, WIDTH / 2, brandY, COLORS.cyan);
  if (nickname) drawText(ctx, nickname, WIDTH / 2, titleY, COLORS.navy);
  drawText(ctx, title, WIDTH / 2, mainTitleY, COLORS.navy);
  drawText(ctx, subtitle, WIDTH / 2, subtitleY, COLORS.muted);

  options.cards.forEach((card, index) => {
    const x = PADDING + (index % COLUMNS) * (CARD_WIDTH + COLUMN_GAP);
    const y = gridY + Math.floor(index / COLUMNS) * (CARD_HEIGHT + ROW_GAP);
    const centerX = x + CARD_WIDTH / 2;
    const icon = icons[index];
    if (icon) {
      const ratio = Math.min((CARD_WIDTH - 12) / icon.naturalWidth, 34 / icon.naturalHeight);
      const width = icon.naturalWidth * ratio;
      const height = icon.naturalHeight * ratio;
      ctx.drawImage(icon, centerX - width / 2, y + (36 - height) / 2, width, height);
    }
    const marker = fitText(ctx, card.groupId, CARD_WIDTH - 12, icon ? 10 : 33, icon ? 9 : 24, 1, 800);
    drawText(ctx, marker, centerX, icon ? y + 43 : y + (60 - marker.lineHeight) / 2, COLORS.group);

    const imageY = y + IMAGE_TOP;
    roundedRect(ctx, x, imageY, CARD_WIDTH, IMAGE_SIZE);
    ctx.fillStyle = COLORS.image;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const image = images[index];
    if (image) {
      const inset = 3;
      const crop = card.crop?.rect ?? [0, 0, image.naturalWidth, image.naturalHeight];
      const [sx, sy, sw, sh] = crop;
      const ratio = Math.min((CARD_WIDTH - inset * 2) / sw, (IMAGE_SIZE - inset * 2) / sh);
      const imageWidth = sw * ratio;
      const imageHeight = sh * ratio;
      ctx.drawImage(image, sx, sy, sw, sh, x + (CARD_WIDTH - imageWidth) / 2, imageY + (IMAGE_SIZE - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      const empty = fitText(ctx, options.emptyLabel, CARD_WIDTH - 20, 12, 10, 2, 400);
      drawText(ctx, empty, centerX, imageY + (IMAGE_SIZE - empty.lines.length * empty.lineHeight) / 2, COLORS.empty);
    }
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(x, imageY, CARD_WIDTH, 3);
    ctx.restore();
    roundedRect(ctx, x + 0.5, imageY + 0.5, CARD_WIDTH - 1, IMAGE_SIZE - 1);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const name = fitText(ctx, card.name || options.emptyLabel, CARD_WIDTH - 4, 14, 11, 2, 700, 1.25);
    const group = fitText(ctx, card.groupName, CARD_WIDTH - 4, 11, 10, 2, 500, 1.25);
    const groupY = imageY + IMAGE_SIZE + 12;
    drawText(ctx, group, centerX, groupY, COLORS.group);
    drawText(ctx, name, centerX, groupY + group.lines.length * group.lineHeight + 4, COLORS.navy);
  });

  ctx.beginPath();
  ctx.moveTo(PADDING, footerY - 18);
  ctx.lineTo(WIDTH - PADDING, footerY - 18);
  ctx.strokeStyle = '#d4e2e9';
  ctx.lineWidth = 1;
  ctx.stroke();
  drawText(ctx, brand, PADDING, footerY, COLORS.cyan, 'left');
  drawText(ctx, footer, WIDTH - PADDING, footerY, COLORS.muted, 'right');

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to encode the PNG image'));
      }, 'image/png');
    } catch (cause) {
      reject(new Error('Unable to encode the PNG image', { cause }));
    }
  });
}
