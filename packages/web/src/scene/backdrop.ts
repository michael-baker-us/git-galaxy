import { createRng } from "@git-galaxy/shared";
import * as THREE from "three";
import { createStarTexture } from "./starTexture";

/**
 * Deep-space atmosphere: a far shell of faint dust stars plus a few huge,
 * barely-there nebula sprites. Pure set dressing — no data meaning.
 */
export function createBackdrop(seed = 7): THREE.Group {
  const group = new THREE.Group();
  const rng = createRng(seed);

  const DUST_COUNT = 1600;
  const positions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    // Uniform direction via normalized gaussians, pushed to a far shell.
    const x = rng.gaussian();
    const y = rng.gaussian();
    const z = rng.gaussian();
    const len = Math.hypot(x, y, z) || 1;
    const r = rng.range(1800, 3200);
    positions[i * 3] = (x / len) * r;
    positions[i * 3 + 1] = (y / len) * r;
    positions[i * 3 + 2] = (z / len) * r;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: 0xaebadf,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  group.add(dust);

  const texture = createStarTexture(128);
  const nebulaColors = [0x2b3a8f, 0x5a2b8f, 0x1f5f6e, 0x6e2b50];
  for (const color of nebulaColors) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    const x = rng.gaussian();
    const y = rng.gaussian() * 0.4;
    const z = rng.gaussian();
    const len = Math.hypot(x, y, z) || 1;
    const r = rng.range(700, 1200);
    sprite.position.set((x / len) * r, (y / len) * r, (z / len) * r);
    sprite.scale.setScalar(rng.range(900, 1700));
    group.add(sprite);
  }

  return group;
}

/** Warm additive glow over the galactic bulge — reads as billions of unresolved stars. */
export function createCoreGlow(galaxyRadius: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: createStarTexture(128),
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(galaxyRadius * 1.6);
  return sprite;
}
