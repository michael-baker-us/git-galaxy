import { type GalaxySnapshot, galaxyRadius, layoutCommits, layoutTree } from "@git-galaxy/shared";
import * as THREE from "three";
import { fetchGalaxy } from "./data/api";
import { mockGalaxy } from "./data/mock";
import { OrbitSystem } from "./scene/OrbitSystem";
import { Starfield } from "./scene/Starfield";
import { createBackdrop } from "./scene/backdrop";
import { createScene } from "./scene/createScene";
import { renderHud } from "./ui/hud";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const hud = document.querySelector<HTMLElement>("#hud");
if (!canvas || !hud) throw new Error("missing #scene canvas or #hud element");

let snapshot: GalaxySnapshot;
let note: string | undefined;
try {
  snapshot = await fetchGalaxy();
} catch {
  snapshot = mockGalaxy();
  note = "server unreachable — showing mock data";
}
renderHud(hud, snapshot, note);

const { renderer, scene, camera, controls, render, onResize } = createScene(canvas);

scene.add(createBackdrop());

// The living codebase sits at the galactic center; its history spirals
// around it. The system is tilted a few degrees off the disc plane so the
// two read as one object with structure, not two stacked plates.
const orbits = new OrbitSystem(layoutTree(snapshot.tree));
orbits.group.rotation.set(0.16, 0, 0.1);
scene.add(orbits.group);
scene.add(new THREE.AmbientLight(0x8899bb, 0.4));

// The commit disc starts just outside the system and spirals outward in time.
const innerHole = orbits.reach + 8;
const discRadius = Math.max(galaxyRadius(snapshot.commits.length), innerHole + 35);
const stars = layoutCommits(snapshot.commits, snapshot.authors, {
  maxRadius: discRadius,
  minRadius: innerHole,
});
const starfield = new Starfield(stars);
scene.add(starfield.points);
onResize((heightPx) => starfield.setViewportHeight(heightPx, camera.fov));

// A lowish camera angle keeps the disc's depth visible instead of flattening it.
const frame = Math.max(160, discRadius * 2.3);
camera.position.set(0, frame * 0.3, frame);
controls.target.set(0, 0, 0);

// Deep-link straight to the folder system (handy while developing).
if (location.hash === "#system") {
  camera.position.set(0, orbits.reach * 0.8 + 12, orbits.reach * 1.6 + 20);
}

// Intro: dolly in from deep space while the stars resolve.
const INTRO_SECONDS = 2.8;
const introTarget = camera.position.clone();
const introStart = introTarget.clone().multiplyScalar(2.6);
camera.position.copy(introStart);
starfield.setOpacity(0);
controls.enabled = false;
let introDone = false;
const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();

  if (!introDone) {
    const k = easeOutCubic(Math.min(1, t / INTRO_SECONDS));
    camera.position.lerpVectors(introStart, introTarget, k);
    starfield.setOpacity(k);
    if (t >= INTRO_SECONDS) {
      introDone = true;
      controls.enabled = true;
    }
  }

  starfield.update(t);
  orbits.update(t);
  controls.update();
  render();
});
