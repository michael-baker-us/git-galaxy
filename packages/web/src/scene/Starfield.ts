import type { StarPlacement } from "@git-galaxy/shared";
import * as THREE from "three";
import { createStarTexture } from "./starTexture";

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelScale;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;
    vTwinkle = 0.82 + 0.22 * sin(uTime * (0.5 + aSeed * 1.8) + aSeed * 40.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    float alpha = texture2D(uTexture, gl_PointCoord).a;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha * uOpacity * vTwinkle);
  }
`;

/** One draw call for the whole commit history: THREE.Points + additive glow. */
export class Starfield {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: {
    uTexture: THREE.IUniform<THREE.Texture>;
    uTime: THREE.IUniform<number>;
    uOpacity: THREE.IUniform<number>;
    uPixelScale: THREE.IUniform<number>;
  };

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

    this.uniforms = {
      uTexture: { value: createStarTexture() },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uPixelScale: { value: 600 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uTime.value = elapsedSeconds;
    // One majestic rotation every ~20 minutes; OrbitControls adds the rest.
    this.points.rotation.y = elapsedSeconds * 0.005;
  }

  setOpacity(opacity: number): void {
    this.uniforms.uOpacity.value = opacity;
  }

  /** Keep on-screen star size proportional to viewport height. */
  setViewportHeight(heightPx: number, fovDegrees: number): void {
    const fovRadians = (fovDegrees * Math.PI) / 180;
    this.uniforms.uPixelScale.value = (heightPx / (2 * Math.tan(fovRadians / 2))) * 1.4;
  }
}
