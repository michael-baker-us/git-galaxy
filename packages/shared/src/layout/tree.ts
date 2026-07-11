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
  /** Longitude of the ascending node — where the tilted plane crosses flat, radians. */
  node: number;
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
/** Files share rings ("necklaces") so busy folders stay compact. */
const FILES_PER_RING = 12;
const RING_SPACING = 1.3;
/** Spacing cap: a huge subtree may overlap a little instead of pushing every sibling out. */
const SPACING_CAP = 18;

const folderBodyRadius = (totalFiles: number): number => 1.6 + 0.85 * Math.log1p(totalFiles);

const fileBodyRadius = (bytes: number): number =>
  Math.min(1.3, Math.max(0.3, 0.28 + 0.07 * Math.log1p(bytes)));

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
      node: 0,
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
    // Each ring is a coherent plane with its own 3D tilt — necklaces stay
    // evenly spaced within their plane, but the planes interleave like a
    // gyroscope instead of stacking flat.
    const fileRingCount = Math.ceil(files.length / FILES_PER_RING);
    const fileRings = Array.from({ length: fileRingCount }, () => ({
      inclination: rng.gaussian() * 0.45,
      node: rng.range(0, 2 * Math.PI),
    }));
    files.forEach((file, i) => {
      const ring = Math.floor(i / FILES_PER_RING);
      const plane = fileRings[ring] ?? { inclination: 0, node: 0 };
      const orbitRadius = bodyRadius * 1.45 + RING_SPACING * (ring + 1);
      fileZone = Math.max(fileZone, orbitRadius);
      placements.push({
        path: file.path,
        name: file.name,
        parentPath: folder.path,
        kind: "file",
        depth: depth + 1,
        orbitRadius,
        orbitPeriod: keplerPeriod(orbitRadius),
        // Even spacing around the ring keeps necklaces from clumping;
        // same radius = same speed, so the spacing holds forever.
        phase: ((i % FILES_PER_RING) / FILES_PER_RING) * 2 * Math.PI + rng.range(-0.15, 0.15),
        inclination: plane.inclination,
        node: plane.node,
        bodyRadius: fileBodyRadius(file.bytes),
        color: extColor(file.ext),
      });
    });

    let extent = Math.max(bodyRadius, fileZone);

    // Subfolder planets orbit beyond the satellite swarm. Siblings share
    // rings (evenly phase-spaced; same radius = same speed, so spacing
    // holds forever) instead of one concentric orbit each — concentric
    // orbits explode combinatorially for folders with many children.
    // Extents are capped for spacing: monster subtrees may overlap
    // slightly rather than inflate the whole system.
    if (depth < maxDepth) {
      const children = folder.children
        .filter((c): c is FolderNode => c.type === "dir")
        .sort((a, b) => b.totalFiles - a.totalFiles)
        .map((sub) => layoutFolder(sub, depth + 1, folder.path));

      let ringInner = extent + ORBIT_GAP;
      let i = 0;
      while (i < children.length) {
        const first = children[i];
        if (first === undefined) break;
        // Children are sorted biggest-first, so the first member bounds the ring.
        const ringExtent = Math.min(first.extent, SPACING_CAP);
        const radius = ringInner + ringExtent;
        const footprint = 2 * Math.asin(Math.min(1, (ringExtent + ORBIT_GAP / 2) / radius));
        const capacity = Math.max(1, Math.floor((2 * Math.PI) / footprint));
        const members = children.slice(i, i + capacity);
        const plane = { inclination: rng.gaussian() * 0.28, node: rng.range(0, 2 * Math.PI) };
        members.forEach((child, j) => {
          child.placement.orbitRadius = radius;
          child.placement.orbitPeriod = keplerPeriod(radius);
          child.placement.phase = (j / members.length) * 2 * Math.PI + rng.range(-0.1, 0.1);
          child.placement.inclination = plane.inclination;
          child.placement.node = plane.node;
        });
        i += members.length;
        ringInner = radius + ringExtent + ORBIT_GAP;
        extent = radius + Math.max(...members.map((m) => m.extent));
      }
    }

    return { placement, extent };
  };

  layoutFolder(root, 0, null);
  return placements;
}
