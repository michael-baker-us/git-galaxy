import {
  type BodyPlacement,
  type GalaxySnapshot,
  type Rgb,
  type TreeNode,
  type UniverseSnapshot,
  galaxyRadius,
  hashString,
  hslToRgb,
  layoutCommits,
  layoutTree,
} from "@git-galaxy/shared";
import * as THREE from "three";
import { fetchUniverse } from "./data/api";
import { mockGalaxy } from "./data/mock";
import { FlightController } from "./flight";
import { OrbitSystem } from "./scene/OrbitSystem";
import { createSpaceship } from "./scene/Spaceship";
import { Starfield } from "./scene/Starfield";
import { createBackdrop } from "./scene/backdrop";
import { createScene } from "./scene/createScene";
import { createLabel } from "./scene/label";
import { mountControls } from "./ui/controls";
import { renderHud } from "./ui/hud";
import { mountTimeline } from "./ui/timeline";
import { createTooltip, escapeHtml, formatBytes } from "./ui/tooltip";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const hud = document.querySelector<HTMLElement>("#hud");
const controlsEl = document.querySelector<HTMLElement>("#controls");
const tooltipEl = document.querySelector<HTMLElement>("#tooltip");
const timelineEl = document.querySelector<HTMLElement>("#timeline");
const scannerEl = document.querySelector<HTMLElement>("#scanner");
if (!canvas || !hud || !controlsEl || !tooltipEl || !timelineEl || !scannerEl) {
  throw new Error("missing DOM scaffolding");
}
// Hoisted functions (scan) don't inherit the narrowing above.
const scannerBox: HTMLElement = scannerEl;

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

// Universe-wide time range so multi-repo timelines ignite in true order.
let universeMinTs = Number.POSITIVE_INFINITY;
let universeMaxTs = Number.NEGATIVE_INFINITY;
for (const g of universe.galaxies) {
  for (const c of g.commits) {
    if (c.timestamp < universeMinTs) universeMinTs = c.timestamp;
    if (c.timestamp > universeMaxTs) universeMaxTs = c.timestamp;
  }
}
const universeTsSpan = Math.max(1, universeMaxTs - universeMinTs);

/** Stable, well-separated hue per author (golden-angle around the wheel). */
const authorColor = (authorId: number): Rgb => hslToRgb((authorId * 137.508) % 360, 0.72, 0.66);

function buildGalaxy(snapshot: GalaxySnapshot): GalaxyAssembly {
  const group = new THREE.Group();

  // The living codebase sits at the galactic center; its history spirals
  // around it, starting just outside the system's reach.
  const orbits = new OrbitSystem(layoutTree(snapshot.tree));
  orbits.group.rotation.set(0.16, 0, 0.1);
  group.add(orbits.group);

  const innerHole = orbits.reach + 8;
  const discRadius = Math.max(galaxyRadius(snapshot.commits.length), innerHole + 35);
  const placements = layoutCommits(snapshot.commits, snapshot.authors, {
    maxRadius: discRadius,
    minRadius: innerHole,
    seed: hashString(snapshot.meta.repoName) || 1,
  });
  const starfield = new Starfield(placements, {
    births: placements.map((p) => {
      const ts = snapshot.commits[p.commitIndex]?.timestamp ?? universeMinTs;
      return (ts - universeMinTs) / universeTsSpan;
    }),
    altColors: placements.map((p) => authorColor(snapshot.commits[p.commitIndex]?.authorId ?? 0)),
  });
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
const playback = mountControls(controlsEl, () => resetView());
// Grabbing the camera (drag or zoom) pauses rotation through the same state
// the button shows, so the label stays honest and R resumes the drift.
controls.addEventListener("start", () => {
  if (!playback.rotationPaused) playback.setRotationPaused(true);
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

// ── Timeline playback ────────────────────────────────────────────────────
const TIMELINE_SECONDS = 30;
const timeline = { t: 1, playing: false };
const dateLabelFor = (t: number): string => {
  if (!Number.isFinite(universeMinTs)) return "";
  const ts = universeMinTs + t * (universeMaxTs - universeMinTs);
  return new Date(ts * 1000).toISOString().slice(0, 10);
};
const timelineUi = mountTimeline(timelineEl, {
  onScrub(t) {
    timeline.t = t;
    timeline.playing = false;
    timelineUi.setPlaying(false);
    applyTimeline();
  },
  onTogglePlay() {
    if (!timeline.playing && timeline.t >= 1) timeline.t = 0; // replay from the big bang
    timeline.playing = !timeline.playing;
    timelineUi.setPlaying(timeline.playing);
  },
});
function applyTimeline(): void {
  for (const a of assemblies) a.starfield.setTimeline(timeline.t);
  timelineUi.sync(timeline.t, dateLabelFor(timeline.t));
}
applyTimeline();

// ── Spaceship flight ─────────────────────────────────────────────────────
const ship = createSpaceship();
scene.add(ship.group);
const flightBtn = document.createElement("button");
const flight = new FlightController(ship, camera, canvas, (active) => {
  flightBtn.textContent = active ? "🚀 exit flight (F)" : "🚀 fly (F)";
  controls.enabled = !active;
  if (active) {
    tooltip.hide();
  } else {
    scannerEl.style.display = "none";
    // Hand the view back to orbit controls, aimed where the ship was heading.
    flight.lookTarget(controls.target);
  }
});
flightBtn.textContent = "🚀 fly (F)";
flightBtn.addEventListener("click", () => flight.toggle());
controlsEl.appendChild(flightBtn);

// Proximity scanner: cursor tooltips don't exist in flight, so the shuttle
// scans whatever it flies close to instead.
const BODY_SCAN_RANGE = 30;
const STAR_SCAN_RANGE = 12;
const scanVec = new THREE.Vector3();
const scanLocal = new THREE.Vector3();
let lastScanAt = 0;

function scan(): void {
  let bestHtml: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const shipPos = ship.group.position;

  for (const [object, assembly] of bodyOwner) {
    const d = object.getWorldPosition(scanVec).distanceTo(shipPos);
    if (d < BODY_SCAN_RANGE && d < bestDist) {
      const body = object.userData.body as BodyPlacement | undefined;
      if (body) {
        bestDist = d;
        bestHtml = bodyTooltip(assembly, body);
      }
    }
  }

  for (const [points, assembly] of starTargets) {
    // Compare in the starfield's local space (rotating disc, unscaled).
    scanLocal.copy(shipPos);
    points.worldToLocal(scanLocal);
    const placements = assembly.starfield.placements;
    for (let i = 0; i < placements.length; i++) {
      const pos = placements[i]?.position;
      if (!pos) continue;
      const dx = pos[0] - scanLocal.x;
      const dy = pos[1] - scanLocal.y;
      const dz = pos[2] - scanLocal.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < STAR_SCAN_RANGE && d < bestDist) {
        const html = starTooltip(assembly, i);
        if (html) {
          bestDist = d;
          bestHtml = html;
        }
      }
    }
  }

  if (bestHtml) {
    scannerBox.innerHTML = `<div class="scanlabel">◈ SCAN · ${bestDist.toFixed(1)}u</div>${bestHtml}`;
    scannerBox.style.display = "block";
  } else {
    scannerBox.style.display = "none";
  }
}

// ── Intro & loop ─────────────────────────────────────────────────────────
const INTRO_SECONDS = 2.8;
const introTarget = camera.position.clone();
const introStart = introTarget.clone().multiplyScalar(2.6);
camera.position.copy(introStart);
for (const a of assemblies) a.starfield.setOpacity(0);
controls.enabled = false;
let introDone = false;
let introT0 = 0;
const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;

const clock = new THREE.Clock();
let twinkleTime = 0;
let rotationTime = 0;
let orbitTime = 0;
let colorMix = 0;

/** Back to the first-open experience: intro replays, everything unpaused. */
function resetView(): void {
  flight.exit();
  playback.resetPlayback();
  rotationTime = 0;
  orbitTime = 0;
  timeline.t = 1;
  timeline.playing = false;
  timelineUi.setPlaying(false);
  applyTimeline();
  tooltip.hide();
  camera.up.set(0, 1, 0);
  camera.position.copy(introStart);
  controls.target.set(0, 0, 0);
  controls.enabled = false;
  for (const a of assemblies) a.starfield.setOpacity(0);
  introDone = false;
  introT0 = twinkleTime;
}

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
    const k = easeOutCubic(Math.min(1, (twinkleTime - introT0) / INTRO_SECONDS));
    if (!flight.active) camera.position.lerpVectors(introStart, introTarget, k);
    for (const a of assemblies) a.starfield.setOpacity(k);
    if (twinkleTime - introT0 >= INTRO_SECONDS) {
      introDone = true;
      controls.enabled = !flight.active;
    }
  }

  if (timeline.playing) {
    timeline.t = Math.min(1, timeline.t + dt / TIMELINE_SECONDS);
    if (timeline.t >= 1) {
      timeline.playing = false;
      timelineUi.setPlaying(false);
    }
    applyTimeline();
  }

  const mixTarget = playback.authorColors ? 1 : 0;
  if (Math.abs(colorMix - mixTarget) > 0.001) {
    colorMix += (mixTarget - colorMix) * Math.min(1, dt * 6);
    if (Math.abs(colorMix - mixTarget) < 0.001) colorMix = mixTarget;
    for (const a of assemblies) a.starfield.setColorMix(colorMix);
  }

  for (const a of assemblies) {
    a.starfield.update(twinkleTime, rotationTime);
    a.orbits.update(orbitTime);
  }

  if (flight.active) {
    flight.update(dt);
    if (twinkleTime - lastScanAt > 0.15) {
      lastScanAt = twinkleTime;
      scan();
    }
  } else {
    controls.autoRotate = !playback.rotationPaused;
    controls.update();

    // Throttled hover pick: cheap enough to feel live, never a frame hog.
    if (twinkleTime - lastPickAt > 0.08) {
      lastPickAt = twinkleTime;
      pick();
    }
  }

  render();
});
