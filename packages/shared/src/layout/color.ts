import { hashString } from "./random";

export type Rgb = [number, number, number];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Blackbody-style temperature ramp over commit age.
 * ageFraction 0 = newest commit (blue-white), 1 = oldest (deep red).
 */
const TEMPERATURE_STOPS: ReadonlyArray<{ t: number; color: Rgb }> = [
  { t: 0.0, color: [0.62, 0.76, 1.0] },
  { t: 0.25, color: [0.87, 0.91, 1.0] },
  { t: 0.5, color: [1.0, 0.96, 0.84] },
  { t: 0.75, color: [1.0, 0.72, 0.45] },
  { t: 1.0, color: [1.0, 0.42, 0.26] },
];

export function commitTemperatureColor(ageFraction: number): Rgb {
  const t = clamp01(ageFraction);
  for (let i = 0; i < TEMPERATURE_STOPS.length - 1; i++) {
    const a = TEMPERATURE_STOPS[i];
    const b = TEMPERATURE_STOPS[i + 1];
    if (a === undefined || b === undefined) break;
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return [
        lerp(a.color[0], b.color[0], k),
        lerp(a.color[1], b.color[1], k),
        lerp(a.color[2], b.color[2], k),
      ];
    }
  }
  return [...(TEMPERATURE_STOPS[TEMPERATURE_STOPS.length - 1]?.color ?? [1, 1, 1])] as Rgb;
}

/** hue [0,360), sat/light [0,1] → rgb [0,1]. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/** Curated hues for common extensions; everything else hashes to a stable hue. */
const EXT_HUES: Record<string, number> = {
  ts: 211,
  tsx: 211,
  mts: 211,
  cts: 211,
  js: 53,
  jsx: 53,
  mjs: 53,
  cjs: 53,
  json: 90,
  md: 190,
  css: 280,
  scss: 320,
  html: 14,
  py: 200,
  rs: 24,
  go: 187,
  java: 30,
  rb: 356,
  sh: 130,
  yml: 45,
  yaml: 45,
  toml: 45,
  sql: 260,
  svg: 300,
  png: 300,
  jpg: 300,
  gif: 300,
  lock: 0,
};

export function extColor(ext: string): Rgb {
  const hue = EXT_HUES[ext] ?? hashString(ext || "?") % 360;
  return hslToRgb(hue, 0.65, 0.62);
}

/** Muted, stable folder tint so sibling planets are distinguishable. */
export function folderColor(name: string): Rgb {
  return hslToRgb(hashString(name) % 360, 0.32, 0.6);
}
