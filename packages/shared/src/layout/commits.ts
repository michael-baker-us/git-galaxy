import type { Author, Commit } from "../types";
import { type Rgb, commitTemperatureColor } from "./color";
import { createRng } from "./random";

/**
 * Spiral-galaxy placement of commit history.
 *
 * The disc is time: radius = sqrt(chronological rank) so area density stays
 * uniform — a dense bright core of early history, the newest work at the rim.
 * The most prolific authors each own a spiral arm; everyone else scatters as
 * field stars. Repos with fewer than MIN_ARM_AUTHORS distinct authors fall
 * back to golden-angle phyllotaxis (a Vogel spiral).
 */

export interface StarPlacement {
  position: [number, number, number];
  size: number;
  color: Rgb;
  /** Index into the commits array as passed in (newest-first). */
  commitIndex: number;
}

export interface CommitLayoutOptions {
  maxRadius?: number;
  /** Inner hole radius — history starts spiraling outside this (the folder system lives inside). */
  minRadius?: number;
  /** Maximum number of author spiral arms. */
  armCount?: number;
  /** Radians of spiral twist accumulated from core to rim. */
  twist?: number;
  /** Disc thickness (std-dev of vertical jitter at the core). */
  thickness?: number;
  seed?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_ARM_AUTHORS = 3;
/** Radial jitter is uniform and bounded so radius stays a faithful time axis. */
const RADIAL_JITTER = 2;

/**
 * Disc radius adapted to history length: a 20-commit repo gets a compact,
 * cozy galaxy instead of 20 dots lost in a disc sized for thousands.
 */
export function galaxyRadius(commitCount: number): number {
  return Math.min(100, Math.max(26, 100 * Math.sqrt(commitCount / 4000)));
}

/** Stars fatten as histories shrink, so sparse galaxies still feel luminous. */
export function starSizeBoost(commitCount: number): number {
  return Math.min(1.9, Math.max(1, 2.0 - commitCount / 1000));
}

export function layoutCommits(
  commits: Commit[],
  authors: Author[],
  options: CommitLayoutOptions = {},
): StarPlacement[] {
  const {
    maxRadius = 100,
    minRadius = 0,
    armCount = 6,
    twist = 2.6,
    thickness = 5,
    seed = 1,
  } = options;
  const band = Math.max(1, maxRadius - minRadius);
  const total = commits.length;
  if (total === 0) return [];

  const rng = createRng(seed);

  // Chronological rank per commit (input is newest-first, timestamps can be unordered).
  const order = commits.map((c, i) => ({ i, t: c.timestamp }));
  order.sort((a, b) => a.t - b.t || b.i - a.i);
  const rank = new Array<number>(total);
  order.forEach((entry, r) => {
    rank[entry.i] = r;
  });

  const minTs = order[0]?.t ?? 0;
  const maxTs = order[order.length - 1]?.t ?? 0;
  const span = maxTs - minTs;

  // The top authors by commit count get spiral arms.
  const armOfAuthor = new Map<number, number>();
  const byCount = authors
    .map((a, id) => ({ id, count: a.commitCount }))
    .sort((a, b) => b.count - a.count);
  const arms = Math.min(armCount, byCount.length);
  const phyllotaxis = byCount.length < MIN_ARM_AUTHORS;
  if (!phyllotaxis) {
    byCount.slice(0, arms).forEach((a, arm) => armOfAuthor.set(a.id, arm));
  }

  const placements: StarPlacement[] = [];
  for (let i = 0; i < total; i++) {
    const commit = commits[i];
    const r = rank[i];
    if (commit === undefined || r === undefined) continue;

    let radius = minRadius + band * Math.sqrt((r + 0.5) / total);
    let angle: number;
    if (phyllotaxis) {
      angle = r * GOLDEN_ANGLE;
    } else {
      const arm = armOfAuthor.get(commit.authorId);
      const bandFraction = (radius - minRadius) / band;
      if (arm !== undefined) {
        const base = (arm / arms) * 2 * Math.PI;
        // Logarithmic-ish arm: twist grows with radius; arms blur near the core.
        const spread = 0.14 + 0.3 * (1 - bandFraction);
        angle = base + twist * bandFraction + rng.gaussian() * spread;
        radius += rng.range(-RADIAL_JITTER, RADIAL_JITTER);
      } else {
        angle = rng.range(0, 2 * Math.PI);
      }
    }
    radius = Math.max(minRadius > 0 ? minRadius - RADIAL_JITTER : 0.5, radius);

    // Central bulge: the disc swells into a spheroid toward its inner edge.
    const bulge = Math.max(0.35, 1.6 - 1.25 * ((radius - minRadius) / band));
    let y = rng.gaussian() * thickness * bulge;
    // A sparse thick-disc/halo population lives well off the plane —
    // this is what makes the galaxy read as a volume, not a sheet.
    if (rng.next() < 0.1) y *= 2.8;

    const age = span > 0 ? 1 - (commit.timestamp - minTs) / span : 0.5;
    const churn = commit.stats.insertions + commit.stats.deletions;
    let size = 0.8 + 0.35 * Math.log1p(churn);
    if (commit.parents.length > 1) size *= 1.3;
    size = Math.min(4.5, Math.max(0.8, size)) * starSizeBoost(total);

    placements.push({
      position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
      size,
      color: commitTemperatureColor(age),
      commitIndex: i,
    });
  }
  return placements;
}
