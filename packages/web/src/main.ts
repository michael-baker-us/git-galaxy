import { type GalaxySnapshot, layoutCommits } from "@git-galaxy/shared";
import * as THREE from "three";
import { fetchGalaxy } from "./data/api";
import { mockGalaxy } from "./data/mock";
import { Starfield } from "./scene/Starfield";
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

const { renderer, scene, camera, controls, onResize } = createScene(canvas);

const stars = layoutCommits(snapshot.commits, snapshot.authors);
const starfield = new Starfield(stars);
scene.add(starfield.points);
onResize((heightPx) => starfield.setViewportHeight(heightPx, camera.fov));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  starfield.update(t);
  controls.update();
  renderer.render(scene, camera);
});
