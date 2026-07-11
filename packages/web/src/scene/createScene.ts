import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Renders the frame through the bloom pipeline. */
  render: () => void;
  /** Called after the renderer resizes, with the new drawing-buffer height. */
  onResize: (cb: (heightPx: number) => void) => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02020a);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    10_000,
  );
  camera.position.set(0, 120, 260);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 5;
  controls.maxDistance = 1500;
  // Slow celestial drift until the user takes the wheel.
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });

  // Bloom: the scene is mostly black, so a low threshold lets every light
  // source glow without washing the frame out.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45,
    0.55,
    0.2,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resizeCallbacks: Array<(heightPx: number) => void> = [];
  const applySize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const bufferHeight = h * renderer.getPixelRatio();
    for (const cb of resizeCallbacks) cb(bufferHeight);
  };
  window.addEventListener("resize", applySize);
  applySize();

  return {
    renderer,
    scene,
    camera,
    controls,
    render: () => composer.render(),
    onResize: (cb) => {
      resizeCallbacks.push(cb);
      cb(window.innerHeight * renderer.getPixelRatio());
    },
  };
}
