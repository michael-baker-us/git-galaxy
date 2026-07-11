import { type GalaxySnapshot, galaxyRadius, layoutCommits, layoutTree } from "@git-galaxy/shared";
import * as THREE from "three";
import { fetchGalaxy } from "./data/api";
import { mockGalaxy } from "./data/mock";
import { OrbitSystem } from "./scene/OrbitSystem";
import { Starfield } from "./scene/Starfield";
import { createBackdrop, createCoreGlow } from "./scene/backdrop";
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

// Small histories get a compact disc, fatter stars, and a closer camera.
const discRadius = galaxyRadius(snapshot.commits.length);
const stars = layoutCommits(snapshot.commits, snapshot.authors, { maxRadius: discRadius });
const starfield = new Starfield(stars);
scene.add(starfield.points);
if (snapshot.commits.length > 0) scene.add(createCoreGlow(discRadius));
onResize((heightPx) => starfield.setViewportHeight(heightPx, camera.fov));

// The living codebase hovers above the plane of its own history.
const systemY = Math.min(55, discRadius * 0.55 + 20);
const orbits = new OrbitSystem(layoutTree(snapshot.tree));
orbits.group.position.set(0, systemY, 0);
scene.add(orbits.group);
scene.add(new THREE.AmbientLight(0x8899bb, 0.4));

// Frame the whole composition — disc below, folder system above.
const frame = Math.max(150, discRadius * 2.6);
camera.position.set(0, frame * 0.46, frame);
controls.target.set(0, systemY * 0.4, 0);

// Deep-link straight to the folder system (handy while developing).
if (location.hash === "#system") {
  camera.position.set(0, systemY + 25, 75);
  controls.target.copy(orbits.group.position);
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
