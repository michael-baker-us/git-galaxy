import type { StarPlacement } from "@git-galaxy/shared";
import * as THREE from "three";
import { createStarTexture } from "./starTexture";

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelScale;
  uniform float uSizeScale;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;
    vTwinkle = 0.82 + 0.22 * sin(uTime * (0.5 + aSeed * 1.8) + aSeed * 40.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uSizeScale * uPixelScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    float alpha = texture2D(uTexture, gl_PointCoord).a;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha * uOpacity * uIntensity * vTwinkle);
  }
`;

/**
 * Additive blending saturates to white where many sprites overlap, so dense
 * fields get dimmer individual stars — total light stays roughly constant.
 */
function intensityFor(starCount: number): number {
  if (starCount <= 500) return 0.9;
  return Math.max(0.28, 0.9 - (starCount - 500) / 7000);
}

interface StarUniforms extends Record<string, THREE.IUniform> {
  uTexture: THREE.IUniform<THREE.Texture>;
  uTime: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
  uPixelScale: THREE.IUniform<number>;
  uSizeScale: THREE.IUniform<number>;
}

/**
 * Two passes over one geometry, both single draw calls:
 *  - crisp resolved stars
 *  - a huge, faint duplicate ("unresolved starlight") that melts into the
 *    milky band tracing the arms, the way long-exposure photos render the
 *    stars a camera can't separate.
 */
export class Starfield {
  readonly group = new THREE.Group();
  private readonly starUniforms: StarUniforms;
  private readonly glowUniforms: StarUniforms;

  constructor(placements: StarPlacement[]) {
    const n = placements.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const seeds = new Float32Array(n);
    placements.forEach((p, i) => {
      positions.set(p.position, i * 3);
      colors.set(p.color, i * 3);
      sizes[i] = p.size;
      seeds[i] = (i % 997) / 997;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const texture = createStarTexture();
    const makeUniforms = (intensity: number, sizeScale: number): StarUniforms => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uIntensity: { value: intensity },
      uPixelScale: { value: 600 },
      uSizeScale: { value: sizeScale },
    });
    const makeMaterial = (uniforms: StarUniforms): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    this.starUniforms = makeUniforms(intensityFor(n), 1);
    this.glowUniforms = makeUniforms(0.02, 7);
    this.group.add(new THREE.Points(geometry, makeMaterial(this.glowUniforms)));
    this.group.add(new THREE.Points(geometry, makeMaterial(this.starUniforms)));
  }

  update(elapsedSeconds: number): void {
    this.starUniforms.uTime.value = elapsedSeconds;
    this.glowUniforms.uTime.value = elapsedSeconds;
    // One majestic rotation every ~20 minutes; OrbitControls adds the rest.
    this.group.rotation.y = elapsedSeconds * 0.005;
  }

  setOpacity(opacity: number): void {
    this.starUniforms.uOpacity.value = opacity;
    this.glowUniforms.uOpacity.value = opacity;
  }

  /** Keep on-screen star size proportional to viewport height. */
  setViewportHeight(heightPx: number, fovDegrees: number): void {
    const fovRadians = (fovDegrees * Math.PI) / 180;
    const scale = (heightPx / (2 * Math.tan(fovRadians / 2))) * 1.15;
    this.starUniforms.uPixelScale.value = scale;
    this.glowUniforms.uPixelScale.value = scale;
  }
}
