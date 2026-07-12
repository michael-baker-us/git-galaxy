import type { BodyPlacement } from "@git-galaxy/shared";
import * as THREE from "three";
import { createStarTexture } from "./starTexture";

/**
 * Renders the folder tree as an animated orbital system.
 *
 * Scene-graph shape per orbiting body:
 *   parentAnchor → tiltPivot (inclination) → holder (rotates) → anchor(at orbitRadius) → mesh
 * Children attach to their parent's anchor, so moons follow planets for free.
 * Per-frame work is one rotation write per body — cheap for hundreds of bodies,
 * and world positions stay readable for future raycast tooltips.
 *
 * Realism comes from the lighting model: the sun is the only real light
 * source (plus a whisper of ambient), so planets show day/night sides, and
 * a fresnel atmosphere shell gives them a lit rim.
 */

interface OrbitingBody {
  holder: THREE.Group;
  phase: number;
  /** Radians per second. */
  angularSpeed: number;
}

/**
 * Systems render at FULL scale — big repos get a big nucleus and the galaxy
 * disc grows around it; planets are never shrunk to fit. Only a distant
 * safety ceiling (pathological monorepos) compresses, with diminishing
 * returns rather than a hard crush.
 */
const REACH_SOFT_CAP = 300;
const displayReach = (maxReach: number): number =>
  maxReach <= REACH_SOFT_CAP ? maxReach : REACH_SOFT_CAP + (maxReach - REACH_SOFT_CAP) ** 0.72;

const SPHERE = new THREE.SphereGeometry(1, 24, 16);

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vView, normalize(vNormal))), 2.8);
    gl_FragColor = vec4(uColor, rim * 0.35);
  }
`;

export class OrbitSystem {
  readonly group = new THREE.Group();
  /** World-space radius of the whole system after fit-to-scale. */
  reach = 0;
  /** Hover-raycast targets; each carries its BodyPlacement in userData.body. */
  readonly pickables: THREE.Object3D[] = [];
  private readonly bodies: OrbitingBody[] = [];
  private sunLight: THREE.PointLight | null = null;
  private readonly sunGlow: THREE.Object3D[] = [];
  private sunMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(placements: BodyPlacement[]) {
    const anchors = new Map<string, THREE.Group>();
    const reach = new Map<string, number>();
    let maxReach = 0;

    for (const p of placements) {
      const anchor = new THREE.Group();
      anchors.set(p.path, anchor);

      const mesh = new THREE.Mesh(SPHERE, materialFor(p));
      mesh.scale.setScalar(p.bodyRadius);
      mesh.userData.body = p;
      anchor.add(mesh);
      this.pickables.push(mesh);

      if (p.kind === "folder") {
        anchor.add(createAtmosphere(p));
      }

      if (p.parentPath === null) {
        // The root is the system's sun — the scene's real light source,
        // dressed with additive corona sprites so it reads as a star.
        const light = new THREE.PointLight(0xffe2b0, 6000, 0, 2);
        anchor.add(light);
        this.sunLight = light;
        this.sunMaterial = mesh.material as THREE.MeshStandardMaterial;
        // The corona is the nucleus you actually see from a distance, so it
        // doubles as a big hover target for the repo itself.
        const corona = createCorona(p.bodyRadius * 3.2, 0xffe6c0, 0.35);
        corona.userData.body = p;
        this.pickables.push(corona);
        anchor.add(corona);
        const outerCorona = createCorona(p.bodyRadius * 5.5, 0xffc890, 0.05);
        anchor.add(outerCorona);
        this.sunGlow.push(corona, outerCorona);
        this.group.add(anchor);
        reach.set(p.path, 0);
        maxReach = Math.max(maxReach, p.bodyRadius);
        continue;
      }

      const parentAnchor = anchors.get(p.parentPath);
      if (!parentAnchor) continue; // placements are parent-before-child by construction

      const tiltPivot = new THREE.Group();
      // Orient the orbit plane: spin the node line first, then tilt around it.
      tiltPivot.rotateY(p.node);
      tiltPivot.rotateZ(p.inclination);
      parentAnchor.add(tiltPivot);

      const holder = new THREE.Group();
      holder.rotation.y = p.phase;
      tiltPivot.add(holder);

      anchor.position.x = p.orbitRadius;
      holder.add(anchor);

      if (p.kind === "folder") {
        tiltPivot.add(createOrbitRing(p.orbitRadius));
      }

      this.bodies.push({
        holder,
        phase: p.phase,
        angularSpeed: p.orbitPeriod > 0 ? (2 * Math.PI) / p.orbitPeriod : 0,
      });

      // Worst-case distance from system center, for fit-to-scale below.
      const distance = (reach.get(p.parentPath) ?? 0) + p.orbitRadius;
      reach.set(p.path, distance);
      maxReach = Math.max(maxReach, distance + p.bodyRadius);
    }

    const target = displayReach(maxReach);
    if (target < maxReach) {
      this.group.scale.setScalar(target / maxReach);
    }
    this.reach = target;
  }

  update(elapsedSeconds: number): void {
    for (const body of this.bodies) {
      body.holder.rotation.y = body.phase + elapsedSeconds * body.angularSpeed;
    }
  }

  /** Douse or relight the sun: point light, coronas, and the sun's own blaze. */
  setSunLight(on: boolean): void {
    if (this.sunLight) this.sunLight.visible = on;
    for (const glow of this.sunGlow) glow.visible = on;
    if (this.sunMaterial) this.sunMaterial.emissiveIntensity = on ? 2.2 : 0.5;
  }
}

function materialFor(p: BodyPlacement): THREE.MeshStandardMaterial {
  const color = new THREE.Color(...p.color);
  if (p.kind === "root") {
    return new THREE.MeshStandardMaterial({
      color: 0xfff3dd,
      emissive: 0xffdca8,
      emissiveIntensity: 2.2,
    });
  }
  // Nearly all shading comes from the sun; the faint emissive floor just
  // keeps night sides from vanishing entirely.
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    emissive: color,
    emissiveIntensity: p.kind === "file" ? 0.12 : 0.06,
  });
}

function createAtmosphere(p: BodyPlacement): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...p.color).multiplyScalar(1.4) } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(SPHERE, material);
  shell.scale.setScalar(p.bodyRadius * 1.05);
  return shell;
}

function createCorona(scale: number, color: number, opacity: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: createStarTexture(128),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  return sprite;
}

function createOrbitRing(radius: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius - 0.03, radius + 0.03, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9fb2e8,
    transparent: true,
    opacity: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}
