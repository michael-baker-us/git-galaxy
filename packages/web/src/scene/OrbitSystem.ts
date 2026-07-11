import type { BodyPlacement } from "@git-galaxy/shared";
import * as THREE from "three";

/**
 * Renders the folder tree as an animated orbital system.
 *
 * Scene-graph shape per orbiting body:
 *   parentAnchor → tiltPivot (inclination) → holder (rotates) → anchor(at orbitRadius) → mesh
 * Children attach to their parent's anchor, so moons follow planets for free.
 * Per-frame work is one rotation write per body — cheap for hundreds of bodies,
 * and world positions stay readable for future raycast tooltips.
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

export class OrbitSystem {
  readonly group = new THREE.Group();
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

      if (p.parentPath === null) {
        // The root is the system's sun: it sits at the center and lights it.
        const light = new THREE.PointLight(0xffe2b0, 2500, 0, 2);
        anchor.add(light);
        this.group.add(anchor);
        reach.set(p.path, 0);
        maxReach = Math.max(maxReach, p.bodyRadius);
        continue;
      }

      const parentAnchor = anchors.get(p.parentPath);
      if (!parentAnchor) continue; // placements are parent-before-child by construction

      const tiltPivot = new THREE.Group();
      tiltPivot.rotation.z = p.inclination;
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
      color,
      emissive: color,
      emissiveIntensity: 1.4,
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.05,
    emissive: color,
    emissiveIntensity: p.kind === "file" ? 0.75 : 0.4,
  });
}

function createOrbitRing(radius: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius - 0.04, radius + 0.04, 96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9fb2e8,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}
