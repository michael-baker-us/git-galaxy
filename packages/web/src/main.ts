import {
  type BodyPlacement,
  type GalaxySnapshot,
  type TreeNode,
  type UniverseSnapshot,
  galaxyRadius,
  hashString,
  layoutCommits,
  layoutTree,
} from "@git-galaxy/shared";
import * as THREE from "three";
import { fetchUniverse } from "./data/api";
import { mockGalaxy } from "./data/mock";
import { OrbitSystem } from "./scene/OrbitSystem";
import { Starfield } from "./scene/Starfield";
import { createBackdrop } from "./scene/backdrop";
import { createScene } from "./scene/createScene";
import { createLabel } from "./scene/label";
import { mountControls } from "./ui/controls";
import { renderHud } from "./ui/hud";
import { createTooltip, escapeHtml, formatBytes } from "./ui/tooltip";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const hud = document.querySelector<HTMLElement>("#hud");
const controlsEl = document.querySelector<HTMLElement>("#controls");
const tooltipEl = document.querySelector<HTMLElement>("#tooltip");
if (!canvas || !hud || !controlsEl || !tooltipEl) throw new Error("missing DOM scaffolding");

let universe: UniverseSnapshot;
let note: string | undefined;
try {
  universe = await fetchUniverse();
} catch {
  universe = { generatedAt: Date.now(), galaxies: [mockGalaxy()] };
  note = "server unreachable — showing mock data";
}
renderHud(hud, universe, note);

const { renderer, scene, camera, controls, render, onResize } = createScene(canvas);
scene.add(createBackdrop());
// The suns do the lighting; ambient is just a whisper of galactic skylight.
scene.add(new THREE.AmbientLight(0x8899bb, 0.12));

interface GalaxyAssembly {
  snapshot: GalaxySnapshot;
  group: THREE.Group;
  starfield: Starfield;
  orbits: OrbitSystem;
  nodeByPath: Map<string, TreeNode>;
  discRadius: number;
}

function buildGalaxy(snapshot: GalaxySnapshot): GalaxyAssembly {
  const group = new THREE.Group();

  // The living codebase sits at the galactic center; its history spirals
  // around it, starting just outside the system's reach.
  const orbits = new OrbitSystem(layoutTree(snapshot.tree));
  orbits.group.rotation.set(0.16, 0, 0.1);
  group.add(orbits.group);

  const innerHole = orbits.reach + 8;
  const discRadius = Math.max(galaxyRadius(snapshot.commits.length), innerHole + 35);
  const starfield = new Starfield(
    layoutCommits(snapshot.commits, snapshot.authors, {
      maxRadius: discRadius,
      minRadius: innerHole,
      seed: hashString(snapshot.meta.repoName) || 1,
    }),
  );
  group.add(starfield.group);

  const nodeByPath = new Map<string, TreeNode>();
  const walk = (node: TreeNode): void => {
    nodeByPath.set(node.path, node);
    if (node.type === "dir") for (const child of node.children) walk(child);
  };
  walk(snapshot.tree);

  return { snapshot, group, starfield, orbits, nodeByPath, discRadius };
}

const assemblies = universe.galaxies.map(buildGalaxy);

// Universe layout: one galaxy sits at the origin; several share a great ring,
// each tilted its own way, with the camera looking across the middle.
let boundRadius: number;
const firstAssembly = assemblies[0];
if (assemblies.length === 1 && firstAssembly) {
  scene.add(firstAssembly.group);
  boundRadius = firstAssembly.discRadius;
} else {
  // Evenly spaced around a ring whose radius guarantees that every adjacent
  // pair clears each other — galaxies must never overlap.
  const GLOW_MARGIN = 25;
  const GALAXY_GAP = 45;
  const n = assemblies.length;
  const extents = assemblies.map((a) => a.discRadius + GLOW_MARGIN);
  const halfAngle = Math.PI / n;
  let ringRadius = 0;
  for (let i = 0; i < n; i++) {
    const next = extents[(i + 1) % n] ?? 0;
    const needed = ((extents[i] ?? 0) + next + GALAXY_GAP) / (2 * Math.sin(halfAngle));
    ringRadius = Math.max(ringRadius, needed);
  }

  assemblies.forEach((assembly, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const h = hashString(assembly.snapshot.meta.repoName);
    assembly.group.position.set(
      Math.cos(angle) * ringRadius,
      ((h % 100) / 100 - 0.5) * 30,
      Math.sin(angle) * ringRadius,
    );
    assembly.group.rotation.set(
      (((h >> 8) % 100) / 100 - 0.5) * 0.3,
      0,
      (((h >> 16) % 100) / 100 - 0.5) * 0.3,
    );

    const label = createLabel(assembly.snapshot.meta.repoName);
    label.position.set(0, assembly.discRadius * 0.35 + 16, 0);
    label.userData.body = assembly.orbits.pickables[0]?.userData.body;
    assembly.orbits.pickables.push(label);
    assembly.group.add(label);
    scene.add(assembly.group);
  });
  boundRadius = ringRadius + Math.max(...extents);
}

// Single galaxy: a lowish angle keeps the disc's depth visible. A universe
// reads better from higher up, where the ring of galaxies is laid out.
const frame = Math.max(160, boundRadius * (assemblies.length === 1 ? 2.3 : 1.7));
camera.position.set(0, frame * (assemblies.length === 1 ? 0.3 : 0.6), frame);
controls.target.set(0, 0, 0);
controls.maxDistance = Math.max(1500, boundRadius * 6);

// Deep-link straight to the first folder system (handy while developing).
if (location.hash === "#system" && firstAssembly) {
  camera.position.set(
    0,
    firstAssembly.orbits.reach * 0.8 + 12,
    firstAssembly.orbits.reach * 1.6 + 20,
  );
}

// ── Playback ─────────────────────────────────────────────────────────────
const playback = mountControls(controlsEl);
let userTookOver = false;
controls.addEventListener("start", () => {
  userTookOver = true;
});

// ── Hover tooltips ───────────────────────────────────────────────────────
const tooltip = createTooltip(tooltipEl);
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 1.4;
const starTargets = new Map<THREE.Points, GalaxyAssembly>();
const bodyOwner = new Map<THREE.Object3D, GalaxyAssembly>();
const pickTargets: THREE.Object3D[] = [];
for (const assembly of assemblies) {
  for (const object of assembly.orbits.pickables) {
    pickTargets.push(object);
    bodyOwner.set(object, assembly);
  }
  pickTargets.push(assembly.starfield.starPoints);
  starTargets.set(assembly.starfield.starPoints, assembly);
}

function bodyTooltip(assembly: GalaxyAssembly, body: BodyPlacement): string {
  const { meta } = assembly.snapshot;
  const node = assembly.nodeByPath.get(body.path);
  if (body.kind === "root") {
    const files = node?.type === "dir" ? node.totalFiles : 0;
    return `<div>☀ <b>${escapeHtml(meta.repoName)}</b> <span class="dim">· ${escapeHtml(meta.headRef)}</span></div><div class="dim">repository root · ${files.toLocaleString()} files</div>`;
  }
  if (body.kind === "folder" && node?.type === "dir") {
    return `<div>🪐 <b>${escapeHtml(body.path)}/</b></div><div class="dim">folder · ${node.totalFiles.toLocaleString()} files · ${formatBytes(node.totalBytes)}</div>`;
  }
  if (node?.type === "file") {
    return `<div>🛰 <b>${escapeHtml(body.path)}</b></div><div class="dim">file · ${formatBytes(node.bytes)}</div>`;
  }
  return `<div>${escapeHtml(body.path || meta.repoName)}</div>`;
}

function starTooltip(assembly: GalaxyAssembly, pointIndex: number): string | null {
  const placement = assembly.starfield.placements[pointIndex];
  const commit = placement ? assembly.snapshot.commits[placement.commitIndex] : undefined;
  if (!commit) return null;
  const author = assembly.snapshot.authors[commit.authorId];
  const date = new Date(commit.timestamp * 1000).toISOString().slice(0, 10);
  const merge = commit.parents.length > 1 ? " · merge" : "";
  return (
    `<div>✦ <b>${escapeHtml(commit.subject)}</b></div>` +
    `<div class="dim">${escapeHtml(author?.name ?? "unknown")} · ${date} · ` +
    `+${commit.stats.insertions.toLocaleString()} −${commit.stats.deletions.toLocaleString()}` +
    `${merge} · ${commit.hash}</div>` +
    `<div class="dim">${escapeHtml(assembly.snapshot.meta.repoName)}</div>`
  );
}

const pointer = new THREE.Vector2();
let pointerClient: { x: number; y: number } | null = null;
let lastPickAt = 0;
canvas.addEventListener("pointermove", (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerClient = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerleave", () => {
  pointerClient = null;
  tooltip.hide();
});

// Debug handle for e2e tooling: lets a driver project scene objects to
// screen coordinates instead of guessing pixels.
Object.assign(window, { __gg: { assemblies, camera } });

function pick(): void {
  if (!pointerClient) return;
  // The pleasant hit radius for a star grows as you zoom out.
  raycaster.params.Points.threshold = Math.max(
    1.2,
    camera.position.distanceTo(controls.target) * 0.004,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickTargets, false)[0];
  if (!hit) {
    tooltip.hide();
    return;
  }
  let html: string | null = null;
  const body = hit.object.userData.body as BodyPlacement | undefined;
  if (body) {
    const assembly = bodyOwner.get(hit.object);
    if (assembly) html = bodyTooltip(assembly, body);
  } else if (hit.object instanceof THREE.Points && hit.index !== undefined) {
    const assembly = starTargets.get(hit.object);
    if (assembly) html = starTooltip(assembly, hit.index);
  }
  if (html) tooltip.show(html, pointerClient.x, pointerClient.y);
  else tooltip.hide();
}

// ── Intro & loop ─────────────────────────────────────────────────────────
const INTRO_SECONDS = 2.8;
const introTarget = camera.position.clone();
const introStart = introTarget.clone().multiplyScalar(2.6);
camera.position.copy(introStart);
for (const a of assemblies) a.starfield.setOpacity(0);
controls.enabled = false;
let introDone = false;
const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;

const clock = new THREE.Clock();
let twinkleTime = 0;
let rotationTime = 0;
let orbitTime = 0;

onResize(() => {
  const heightPx = window.innerHeight * renderer.getPixelRatio();
  for (const a of assemblies) a.starfield.setViewportHeight(heightPx, camera.fov);
});

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  twinkleTime += dt;
  if (!playback.rotationPaused) rotationTime += dt;
  if (!playback.orbitsPaused) orbitTime += dt;

  if (!introDone) {
    const k = easeOutCubic(Math.min(1, twinkleTime / INTRO_SECONDS));
    camera.position.lerpVectors(introStart, introTarget, k);
    for (const a of assemblies) a.starfield.setOpacity(k);
    if (twinkleTime >= INTRO_SECONDS) {
      introDone = true;
      controls.enabled = true;
    }
  }

  for (const a of assemblies) {
    a.starfield.update(twinkleTime, rotationTime);
    a.orbits.update(orbitTime);
  }
  controls.autoRotate = !userTookOver && !playback.rotationPaused;
  controls.update();

  // Throttled hover pick: cheap enough to feel live, never a frame hog.
  if (twinkleTime - lastPickAt > 0.08) {
    lastPickAt = twinkleTime;
    pick();
  }

  render();
});
