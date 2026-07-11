import * as THREE from "three";
import { createStarTexture } from "./starTexture";

export interface Spaceship {
  group: THREE.Group;
  /** 0..1 — scales the engine glow with throttle. */
  setThrust(t: number): void;
}

/**
 * Low-poly Space Shuttle orbiter, nose pointing -Z (the camera-forward
 * convention, so ship and camera share orientation math). White fuselage,
 * black nose/belly/windows, delta wings, tail fin, three engine bells.
 */
export function createSpaceship(): Spaceship {
  const group = new THREE.Group();

  // Slight emissive floor + an onboard running light: deep space is genuinely
  // dark out here, and an invisible ship is no fun to fly.
  const white = new THREE.MeshStandardMaterial({
    color: 0xf2f3f5,
    metalness: 0.1,
    roughness: 0.55,
    emissive: 0x3a3f4c,
    emissiveIntensity: 0.5,
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x181b21,
    metalness: 0.3,
    roughness: 0.6,
    emissive: 0x0a0c10,
    emissiveIntensity: 0.5,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x4a4e58,
    metalness: 0.8,
    roughness: 0.35,
    emissive: 0x1f2229,
    emissiveIntensity: 0.4,
  });

  const runningLight = new THREE.PointLight(0xbcd0ff, 40, 60, 2);
  runningLight.position.set(0, 3, 2);
  group.add(runningLight);

  // Fuselage: fat white cylinder, slightly tapered toward the nose.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 2.6, 14), white);
  fuselage.geometry.rotateX(Math.PI / 2); // along Z, rear at +Z
  fuselage.position.z = 0.15;
  group.add(fuselage);

  // Black thermal-protection nose cap.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), black);
  nose.scale.set(1, 0.92, 1.7);
  nose.position.set(0, -0.02, -1.25);
  group.add(nose);

  // Black cockpit window band on the upper nose.
  const windows = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.4), black);
  windows.position.set(0, 0.3, -0.98);
  windows.rotation.x = 0.35;
  group.add(windows);

  // Black tiled belly.
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 2.5), black);
  belly.position.set(0, -0.38, 0.15);
  group.add(belly);

  // Delta wings: one extruded symmetric pair, white on top, thin.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.4, -0.2);
  wingShape.lineTo(2.05, 1.35);
  wingShape.lineTo(0.4, 1.35);
  wingShape.closePath();
  const wingShapeLeft = new THREE.Shape();
  wingShapeLeft.moveTo(-0.4, -0.2);
  wingShapeLeft.lineTo(-2.05, 1.35);
  wingShapeLeft.lineTo(-0.4, 1.35);
  wingShapeLeft.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry([wingShape, wingShapeLeft], {
    depth: 0.07,
    bevelEnabled: false,
  });
  wingGeometry.rotateX(Math.PI / 2); // lay flat: shape-Y becomes world Z
  const wings = new THREE.Mesh(wingGeometry, white);
  wings.position.y = -0.18;
  group.add(wings);

  // Tail fin: swept vertical trapezoid at the rear.
  const finShape = new THREE.Shape();
  finShape.moveTo(0.55, 0.25);
  finShape.lineTo(1.45, 0.25);
  finShape.lineTo(1.42, 1.35);
  finShape.lineTo(1.05, 1.35);
  finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.07, bevelEnabled: false });
  finGeometry.rotateY(-Math.PI / 2); // stand upright: shape-X becomes world Z
  const fin = new THREE.Mesh(finGeometry, white);
  group.add(fin);

  // OMS pods flanking the tail.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), white);
    pod.scale.set(1, 1, 2.1);
    pod.position.set(side * 0.32, 0.28, 1.15);
    group.add(pod);
  }

  // Three main engine bells, shuttle-style triangle: one high, two low.
  const bellGeometry = new THREE.CylinderGeometry(0.2, 0.12, 0.4, 12, 1, true);
  bellGeometry.rotateX(Math.PI / 2); // wide end rearward (+Z)
  for (const [x, y] of [
    [0, 0.16],
    [-0.26, -0.14],
    [0.26, -0.14],
  ] as const) {
    const bell = new THREE.Mesh(bellGeometry, metal);
    bell.position.set(x, y, 1.55);
    group.add(bell);
  }

  const engineGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createStarTexture(64),
      color: 0x9fc8ff, // SSME exhaust burns blue-white
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  engineGlow.position.set(0, 0, 1.85);
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
