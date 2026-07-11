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

/** Scale the whole system down if a huge repo would outgrow the galaxy. */
const TARGET_MAX_REACH = 42;

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
    gl_FragColor = vec4(uColor, rim * 0.55);
  }
`;

export class OrbitSystem {
  readonly group = new THREE.Group();
  /** World-space radius of the whole system after fit-to-scale. */
  reach = 0;
  private readonly bodies: OrbitingBody[] = [];

  constructor(placements: BodyPlacement[]) {
    const anchors = new Map<string, THREE.Group>();
    const reach = new Map<string, number>();
    let maxReach = 0;

    for (const p of placements) {
      const anchor = new THREE.Group();
      anchors.set(p.path, anchor);

      const mesh = new THREE.Mesh(SPHERE, materialFor(p));
      mesh.scale.setScalar(p.bodyRadius);
      anchor.add(mesh);

      if (p.kind === "folder") {
        anchor.add(createAtmosphere(p));
      }

      if (p.parentPath === null) {
        // The root is the system's sun — the scene's real light source,
        // dressed with additive corona sprites so it reads as a star.
        const light = new THREE.PointLight(0xffe2b0, 6000, 0, 2);
        anchor.add(light);
        anchor.add(createCorona(p.bodyRadius * 5, 0xffe6c0, 0.5));
        anchor.add(createCorona(p.bodyRadius * 12, 0xffc890, 0.14));
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

    if (maxReach > TARGET_MAX_REACH) {
      this.group.scale.setScalar(TARGET_MAX_REACH / maxReach);
    }
    this.reach = Math.min(maxReach, TARGET_MAX_REACH);
  }

  update(elapsedSeconds: number): void {
    for (const body of this.bodies) {
      body.holder.rotation.y = body.phase + elapsedSeconds * body.angularSpeed;
    }
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
