import type { AvatarAdjustment, AvatarCrop } from './model';

export type Square = [number, number, number, number];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampSquare(size: [number, number], rect: Square): Square {
  const edge = clamp(rect[2], 1, Math.min(...size));
  return [clamp(rect[0], 0, size[0] - edge), clamp(rect[1], 0, size[1] - edge), edge, edge];
}

export function defaultSquare(size: [number, number], rect?: Square | null): Square {
  const edge = rect ? Math.max(rect[2], rect[3]) : Math.min(...size);
  const center = rect ? [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2] : size.map((value) => value / 2);
  return clampSquare(size, [center[0] - edge / 2, center[1] - edge / 2, edge, edge]);
}

export function zoomSquare(size: [number, number], rect: Square, edge: number): Square {
  const bounded = clamp(edge, 1, Math.min(...size));
  return clampSquare(size, [rect[0] + (rect[2] - bounded) / 2, rect[1] + (rect[3] - bounded) / 2, bounded, bounded]);
}

export function cleanAvatarAdjustment(value: unknown): AvatarAdjustment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.image !== 'string' || !/^\/(artworks|ships)\/[\w-]+\.(webp|png|jpe?g)$/.test(item.image)) return undefined;
  if (!Array.isArray(item.size) || item.size.length !== 2 || !item.size.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10000)) return undefined;
  if (!Array.isArray(item.rect) || item.rect.length !== 4 || !item.rect.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const [x, y, width, height] = item.rect;
  if (x < 0 || y < 0 || width < 1 || height < 1 || Math.abs(width - height) > .001 || x + width > item.size[0] + .001 || y + height > item.size[1] + .001) return undefined;
  return { image: item.image, size: [...item.size] as [number, number], rect: [...item.rect] as Square };
}

export function resolveAvatarCrop(image: string, base?: AvatarCrop, adjustment?: AvatarAdjustment): AvatarCrop | undefined {
  const valid = cleanAvatarAdjustment(adjustment);
  if (valid?.image === image && (!base || valid.size.every((value, index) => value === base.size[index]))) {
    return { size: valid.size, rect: valid.rect, method: 'user', score: 1 };
  }
  return base?.rect ? base : undefined;
}
