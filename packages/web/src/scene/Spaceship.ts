import * as THREE from "three";
import { createStarTexture } from "./starTexture";

export interface Spaceship {
  group: THREE.Group;
  /** 0..1 — scales the engine glow with throttle. */
  setThrust(t: number): void;
}

/**
 * Low-poly procedural ship, nose pointing -Z (the camera-forward convention,
 * so ship and camera share orientation math). Lit by the suns like any body.
 */
export function createSpaceship(): Spaceship {
  const group = new THREE.Group();

  // Slight emissive floor + an onboard running light: deep space is genuinely
  // dark out here, and an invisible ship is no fun to fly.
  const hull = new THREE.MeshStandardMaterial({
    color: 0x9aa4bd,
    metalness: 0.65,
    roughness: 0.35,
    emissive: 0x2a3350,
    emissiveIntensity: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x39415c,
    metalness: 0.5,
    roughness: 0.5,
    emissive: 0x1a2138,
    emissiveIntensity: 0.5,
  });

  const runningLight = new THREE.PointLight(0xbcd0ff, 40, 60, 2);
  runningLight.position.set(0, 3, 2);
  group.add(runningLight);

  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 8), hull);
  fuselage.geometry.rotateX(-Math.PI / 2); // tip toward -Z
  group.add(fuselage);

  const wings = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.2), dark);
  wings.position.set(0, 0, 0.55);
  group.add(wings);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.8), dark);
  fin.position.set(0, 0.5, 0.7);
  group.add(fin);

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 8),
    new THREE.MeshStandardMaterial({
      color: 0x223a66,
      metalness: 0.2,
      roughness: 0.1,
      emissive: 0x4fa3ff,
      emissiveIntensity: 0.35,
    }),
  );
  cockpit.scale.set(1, 0.7, 1.5);
  cockpit.position.set(0, 0.32, -0.35);
  group.add(cockpit);

  const engineGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createStarTexture(64),
      color: 0x7fc4ff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  engineGlow.position.set(0, 0, 1.75);
  engineGlow.scale.setScalar(1.4);
  group.add(engineGlow);

  return {
    group,
    setThrust(t: number) {
      const k = Math.max(0.15, Math.min(1, t));
      engineGlow.scale.setScalar(0.8 + 2.2 * k);
      engineGlow.material.opacity = 0.35 + 0.6 * k;
    },
  };
}
