import type { StarPlacement } from "@git-galaxy/shared";
import { createRng } from "@git-galaxy/shared";
import * as THREE from "three";
import { createStarTexture } from "./starTexture";

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPixelScale;
  uniform float uSizeScale;
  uniform float uMaxPixels;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;
    vTwinkle = 0.82 + 0.22 * sin(uTime * (0.5 + aSeed * 1.8) + aSeed * 40.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Cap on-screen size: real stars stay point-like however close they are.
    gl_PointSize = min(aSize * uSizeScale * uPixelScale / -mvPosition.z, uMaxPixels);
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
  uMaxPixels: THREE.IUniform<number>;
}

/** Fractions of viewport height each pass may reach per star. */
const STAR_MAX = 0.02;
const GLOW_MAX = 0.09;
const DUST_MAX = 0.3;

/**
 * Three passes, three draw calls, one geometry (plus a dust sample):
 *  1. faint huge "unresolved starlight" melting into the milky arm band
 *  2. dark dust lanes — clumpy clouds hugging the disc plane that darken
 *     the band behind them (normal blending, drawn between glow and stars)
 *  3. crisp point stars on top
 * Contrast comes from pass 2; realism is dark lanes as much as light.
 */
export class Starfield {
  readonly group = new THREE.Group();
  private readonly allUniforms: StarUniforms[] = [];

  constructor(placements: StarPlacement[]) {
    const texture = createStarTexture();
    const makeUniforms = (intensity: number, sizeScale: number, maxFrac: number): StarUniforms => {
      const uniforms: StarUniforms = {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uIntensity: { value: intensity },
        uPixelScale: { value: 600 },
        uSizeScale: { value: sizeScale },
        uMaxPixels: { value: 900 * maxFrac },
      };
      this.allUniforms.push(uniforms);
      return uniforms;
    };
    const makeMaterial = (uniforms: StarUniforms, blending: THREE.Blending): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending,
      });

    const starGeometry = buildGeometry(placements);
    const n = placements.length;

    const glow = new THREE.Points(
      starGeometry,
      makeMaterial(makeUniforms(0.014, 6, GLOW_MAX), THREE.AdditiveBlending),
    );
    glow.renderOrder = 0;
    this.group.add(glow);

    const dustPlacements = sampleDust(placements);
    if (dustPlacements.length > 0) {
      const dust = new THREE.Points(
        buildGeometry(dustPlacements),
        makeMaterial(makeUniforms(0.5, 1, DUST_MAX), THREE.NormalBlending),
      );
      dust.renderOrder = 1;
      this.group.add(dust);
    }

    const stars = new THREE.Points(
      starGeometry,
      makeMaterial(makeUniforms(intensityFor(n), 1, STAR_MAX), THREE.AdditiveBlending),
    );
    stars.renderOrder = 2;
    this.group.add(stars);
  }

  update(elapsedSeconds: number): void {
    for (const uniforms of this.allUniforms) uniforms.uTime.value = elapsedSeconds;
    // One majestic rotation every ~20 minutes; OrbitControls adds the rest.
    this.group.rotation.y = elapsedSeconds * 0.005;
  }

  setOpacity(opacity: number): void {
    for (const uniforms of this.allUniforms) uniforms.uOpacity.value = opacity;
  }

  /** Keep on-screen star size proportional to viewport height. */
  setViewportHeight(heightPx: number, fovDegrees: number): void {
    const fovRadians = (fovDegrees * Math.PI) / 180;
    const scale = (heightPx / (2 * Math.tan(fovRadians / 2))) * 1.15;
    const maxFracs = [GLOW_MAX, DUST_MAX, STAR_MAX];
    this.allUniforms.forEach((uniforms, i) => {
      uniforms.uPixelScale.value = scale;
      uniforms.uMaxPixels.value = heightPx * (maxFracs[i] ?? STAR_MAX);
    });
  }
}

function buildGeometry(placements: StarPlacement[]): THREE.BufferGeometry {
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
  return geometry;
}

/**
 * Dust lanes ride the arms: sample stars, pull them slightly inward, flatten
 * them onto the disc plane, and render them as large dark clouds.
 */
function sampleDust(placements: StarPlacement[]): StarPlacement[] {
  const rng = createRng(1234);
  const dust: StarPlacement[] = [];
  for (let i = 0; i < placements.length; i += 3) {
    const p = placements[i];
    if (p === undefined) continue;
    const [x, y, z] = p.position;
    const tint = rng.range(0.03, 0.09);
    dust.push({
      position: [x * rng.range(0.88, 0.97), y * 0.25, z * rng.range(0.88, 0.97)],
      size: rng.range(5, 13),
      color: [tint * 1.4, tint, tint * 0.8],
      commitIndex: p.commitIndex,
    });
  }
  return dust;
}
