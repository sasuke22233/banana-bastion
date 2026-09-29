const cache = new Map<string, HTMLCanvasElement>();

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Soft radial glow sprite, cached by color. */
export function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const key = `g:${color}:${size}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, rgba(color, 0.95));
  grad.addColorStop(0.25, rgba(color, 0.55));
  grad.addColorStop(0.6, rgba(color, 0.14));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

/** Large soft nebula blob, cached by hue (rounded). */
export function nebulaSprite(hue: number): HTMLCanvasElement {
  const h = ((Math.round(hue / 6) * 6) % 360 + 360) % 360;
  const key = `n:${h}`;
  let c = cache.get(key);
  if (c) return c;
  const size = 256;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, `hsla(${h}, 85%, 60%, 0.42)`);
  grad.addColorStop(0.35, `hsla(${h}, 80%, 50%, 0.2)`);
  grad.addColorStop(0.7, `hsla(${(h + 30) % 360}, 80%, 45%, 0.06)`);
  grad.addColorStop(1, `hsla(${h}, 80%, 45%, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const hypot = (x: number, y: number) => Math.sqrt(x * x + y * y);
