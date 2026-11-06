import type { EventKind, VesselKind } from './kinds';

/**
 * Map icons are drawn on a canvas at runtime (no image files, no fonts) and handed to MapLibre with addImage.
 * Everything is drawn on a 24x24 grid and scaled up, so each glyph is easy to read and tweak.
 */
const S = 56; // pixels per icon; shown at pixelRatio 2, so 28 CSS px
const K = S / 24;

export const SEV_COLOR = { 1: '#ffd60a', 2: '#ff9f0a', 3: '#ff453a' } as const;

type Draw = (c: CanvasRenderingContext2D) => void;
const fill = (c: CanvasRenderingContext2D, d: string) => c.fill(new Path2D(d));
const line = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
};
const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
};
const star = (points: number, outer: number, inner: number) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = (Math.PI * i) / points - Math.PI / 2;
    return `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join('') + 'Z';

/** White glyphs for the event badges. */
const GLYPH: Record<EventKind, Draw> = {
  airstrike: (c) => fill(c, 'M12 2c2 2 3 5 3 8v6l2.5 3v1.5H14l-2 2.5-2-2.5H6.5V19L9 16v-6c0-3 1-6 3-8z'),
  battle: (c) => { c.lineWidth = 2.6; line(c, 5, 5, 19, 19); line(c, 19, 5, 5, 19); c.lineWidth = 2; line(c, 4, 9, 9, 4); line(c, 20, 9, 15, 4); },
  explosion: (c) => fill(c, star(8, 10.5, 5)),
  naval: (c) => {
    c.lineWidth = 2; c.lineCap = 'round'; dot(c, 12, 5, 2);
    line(c, 12, 7, 12, 20); line(c, 8, 10, 16, 10);
    c.beginPath(); c.moveTo(5, 15); c.quadraticCurveTo(7, 21, 12, 20.5); c.quadraticCurveTo(17, 21, 19, 15); c.stroke();
  },
  ceasefire: (c) => { c.lineWidth = 2.2; line(c, 7, 4, 7, 21); fill(c, 'M7.5 5h11l-3.2 4 3.2 4h-11z'); },
  civilians: (c) => { dot(c, 12, 7, 3.4); fill(c, 'M5.5 20.5c0-4.5 2.8-7.5 6.5-7.5s6.5 3 6.5 7.5z'); },
  protest: (c) => { c.lineWidth = 2.2; line(c, 12, 12, 12, 21); fill(c, 'M5 4h14v9H5z'); },
  power: (c) => fill(c, 'M13.5 1.5L4.5 13.5h6.5l-1.5 9 10-13h-6.5z'),
  other: (c) => { c.lineWidth = 2.8; c.lineCap = 'round'; line(c, 12, 5, 12, 14); dot(c, 12, 19, 1.8); },
};

function canvas(w = S, h = S) {
  const el = document.createElement('canvas');
  el.width = w; el.height = h;
  const c = el.getContext('2d')!;
  c.scale(w / 24, h / 24);
  return { el, c };
}
const image = (el: HTMLCanvasElement) => {
  const c = el.getContext('2d')!;
  return c.getImageData(0, 0, el.width, el.height);
};

/** Round badge in the severity colour with a white glyph. */
function badge(kind: EventKind, sev: 1 | 2 | 3) {
  const { el, c } = canvas();
  c.fillStyle = SEV_COLOR[sev];
  c.strokeStyle = 'rgba(255,255,255,.95)';
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(12, 12, 10.6, 0, 7); c.fill(); c.stroke();
  c.save();
  c.translate(12, 12); c.scale(0.58, 0.58); c.translate(-12, -12);
  c.fillStyle = c.strokeStyle = sev === 1 ? '#3a2e00' : '#fff';
  GLYPH[kind](c);
  c.restore();
  return image(el);
}

const OUTLINE = 'rgba(0,0,0,.7)';
function sprite(draw: Draw, size = S) {
  const { el, c } = canvas(size, size);
  c.lineJoin = 'round';
  draw(c);
  return image(el);
}

export const PLANE = 'M12 1.5c.9 0 1.6 1 1.6 2.3v5.6l8.4 5.2v2.3l-8.4-2.5v4.6l2.4 1.9v1.8L12 21.6 8 22.7v-1.8l2.4-1.9v-4.6L2 16.9v-2.3l8.4-5.2V3.8c0-1.3.7-2.3 1.6-2.3z';
const HULL = 'M12 1.5c2.7 3 3.7 6.6 3.7 10.5v9a1 1 0 0 1-1 1H9.3a1 1 0 0 1-1-1v-9c0-3.9 1-7.5 3.7-10.5z';

const SHIP_COLOR: Record<VesselKind, string> = {
  navy: '#bf5af2', cargo: '#ff9f0a', tanker: '#ff6b6b', passenger: '#f1f3f5', fishing: '#32d74b', tug: '#ffd60a', sail: '#64d2ff', other: '#8d99ae',
};
export const shipColor = (k: VesselKind) => SHIP_COLOR[k];

const SHIP: Record<VesselKind, Draw> = {
  navy: (c) => { c.fillStyle = '#fff'; dot(c, 12, 8, 1.7); c.fillRect(10.2, 14, 3.6, 4.5); },
  cargo: (c) => { c.fillStyle = 'rgba(255,255,255,.6)'; for (const y of [8.5, 12, 15.5]) c.fillRect(9.4, y, 5.2, 2.8); },
  tanker: (c) => { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.4; line(c, 12, 6, 12, 20); line(c, 10, 9, 14, 9); line(c, 10, 13, 14, 13); },
  passenger: (c) => { c.fillStyle = '#868e96'; c.fillRect(9.2, 8, 5.6, 10.5); c.fillStyle = '#fff'; c.fillRect(10.2, 9.5, 3.6, 1.4); },
  fishing: (c) => { c.strokeStyle = '#fff'; c.lineWidth = 1.3; line(c, 12, 5.5, 12, 17); line(c, 9, 9, 15, 9); },
  tug: (c) => { c.fillStyle = 'rgba(0,0,0,.45)'; dot(c, 12, 14, 2.3); },
  sail: (c) => { c.fillStyle = '#fff'; fill(c, 'M12 3L19 16.5H12z'); fill(c, 'M11 6L5.5 16.5H11z'); },
  other: () => {},
};

function ship(kind: VesselKind) {
  return sprite((c) => {
    c.fillStyle = SHIP_COLOR[kind]; c.strokeStyle = OUTLINE; c.lineWidth = 1.4;
    c.save();
    if (kind === 'tug') { c.translate(12, 12); c.scale(1.25, 0.8); c.translate(-12, -12); } // short and stubby
    fill(c, HULL); c.stroke(new Path2D(HULL));
    c.restore();
    SHIP[kind](c);
  });
}

const plane = () => sprite((c) => { c.fillStyle = '#4cc9f0'; c.strokeStyle = OUTLINE; c.lineWidth = 1.3; fill(c, PLANE); c.stroke(new Path2D(PLANE)); });
const helo = () =>
  sprite((c) => {
    c.fillStyle = '#4cc9f0'; c.strokeStyle = OUTLINE; c.lineWidth = 1.3;
    c.beginPath(); c.ellipse(12, 11.5, 3, 5, 0, 0, 7); c.fill(); c.stroke();
    c.fillRect(11.2, 15, 1.6, 7);
    c.strokeStyle = '#e8f9ff'; c.lineWidth = 1.6; line(c, 4, 5, 20, 18); line(c, 20, 5, 4, 18);
  });

let cache: Map<string, ImageData> | undefined;
function build() {
  const m = new Map<string, ImageData>();
  for (const k of Object.keys(GLYPH) as EventKind[]) for (const s of [1, 2, 3] as const) m.set(`ev-${k}-${s}`, badge(k, s));
  for (const k of Object.keys(SHIP) as VesselKind[]) m.set(`ship-${k}`, ship(k));
  m.set('plane', plane());
  m.set('helo', helo());
  return m;
}

/** Add every icon to the map. Call after each style load, because changing the style clears images. */
export function addIcons(map: { hasImage(n: string): boolean; addImage(n: string, i: ImageData, o?: { pixelRatio: number }): void }) {
  cache ??= build();
  for (const [name, img] of cache) if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
}
