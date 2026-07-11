import type { FileNode, FolderNode } from "../types";
import { type Rgb, extColor, folderColor } from "./color";
import { createRng, hashString } from "./random";

/**
 * The file tree at HEAD becomes an orbital system: the root folder is the
 * central sun, subfolders are planets orbiting their parent, files are small
 * satellites swarming their folder. Orbit periods follow Kepler's third law
 * (T ∝ r^1.5) so inner bodies visibly outrun outer ones.
 *
 * Placements are hierarchical: orbitRadius is relative to the parent body.
 * The renderer reconstructs the hierarchy via parentPath.
 */

export type BodyKind = "root" | "folder" | "file";

export interface BodyPlacement {
  path: string;
  name: string;
  parentPath: string | null;
  kind: BodyKind;
  depth: number;
  /** Distance from the parent body's center; 0 for the root. */
  orbitRadius: number;
  /** Seconds per revolution. */
  orbitPeriod: number;
  /** Starting angle, radians. */
  phase: number;
  /** Orbit-plane tilt, radians. */
  inclination: number;
  bodyRadius: number;
  color: Rgb;
}

export interface TreeLayoutOptions {
  /** Folders deeper than this render as leaf planets (their mass still counts). */
  maxDepth?: number;
  /** Satellite cap per folder; busiest files render, the rest are implied. */
  maxFilesPerFolder?: number;
  seed?: number;
}

const ORBIT_GAP = 1.6;
const PERIOD_SCALE = 14;
const PERIOD_REF_RADIUS = 8;

const folderBodyRadius = (totalFiles: number): number => 1.0 + 0.6 * Math.log1p(totalFiles);

const fileBodyRadius = (bytes: number): number =>
  Math.min(0.8, Math.max(0.15, 0.12 + 0.045 * Math.log1p(bytes)));

const keplerPeriod = (orbitRadius: number): number =>
  PERIOD_SCALE * (orbitRadius / PERIOD_REF_RADIUS) ** 1.5;

export function layoutTree(root: FolderNode, options: TreeLayoutOptions = {}): BodyPlacement[] {
  const { maxDepth = 4, maxFilesPerFolder = 30, seed = 1 } = options;
  const placements: BodyPlacement[] = [];

  /** Lays out one folder's system; returns its total extent (radius including children). */
  const layoutFolder = (
    folder: FolderNode,
    depth: number,
    parentPath: string | null,
  ): { placement: BodyPlacement; extent: number } => {
    const rng = createRng((seed ^ hashString(folder.path)) >>> 0);
    const bodyRadius = folderBodyRadius(folder.totalFiles);
    const placement: BodyPlacement = {
      path: folder.path,
      name: folder.name,
      parentPath,
      kind: depth === 0 ? "root" : "folder",
      depth,
      orbitRadius: 0, // parent assigns this after sizing siblings
      orbitPeriod: 0,
      phase: 0,
      inclination: 0,
      bodyRadius,
      color: depth === 0 ? [1.0, 0.85, 0.55] : folderColor(folder.name),
    };
    placements.push(placement);

    // File satellites swarm close to the folder.
    const files = folder.children
      .filter((c): c is FileNode => c.type === "file")
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, maxFilesPerFolder);
    let fileZone = bodyRadius;
    files.forEach((file, i) => {
      const orbitRadius = bodyRadius * 1.5 + 0.35 * i;
      fileZone = orbitRadius;
      placements.push({
        path: file.path,
        name: file.name,
        parentPath: folder.path,
        kind: "file",
        depth: depth + 1,
        orbitRadius,
        orbitPeriod: keplerPeriod(orbitRadius),
        phase: rng.range(0, 2 * Math.PI),
        inclination: rng.gaussian() * 0.35,
        bodyRadius: fileBodyRadius(file.bytes),
        color: extColor(file.ext),
      });
    });

    let extent = Math.max(bodyRadius, fileZone);

    // Subfolder planets orbit beyond the satellite swarm, spaced by their
    // own subtree extents so systems never collide.
    if (depth < maxDepth) {
      const subfolders = folder.children
        .filter((c): c is FolderNode => c.type === "dir")
        .sort((a, b) => b.totalFiles - a.totalFiles);
      let cursor = extent + ORBIT_GAP;
      for (const sub of subfolders) {
        const child = layoutFolder(sub, depth + 1, folder.path);
        const orbitRadius = cursor + child.extent;
        child.placement.orbitRadius = orbitRadius;
        child.placement.orbitPeriod = keplerPeriod(orbitRadius);
        child.placement.phase = rng.range(0, 2 * Math.PI);
        child.placement.inclination = rng.gaussian() * 0.1;
        cursor = orbitRadius + child.extent + ORBIT_GAP;
        extent = orbitRadius + child.extent;
      }
    }

    return { placement, extent };
  };

  layoutFolder(root, 0, null);
  return placements;
}
