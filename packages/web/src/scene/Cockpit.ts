import * as THREE from "three";

/**
 * The view from the pilot's seat: dashboard console, A-pillar struts, and a
 * canopy frame in your peripheral vision. Attached to the camera and lit by
 * the real scene, so the dash catches sun-glow as you bank past a nucleus.
 * Deliberately low-poly — a toy shuttle, not a simulator.
 */
export function createCockpit(): THREE.Group {
  const group = new THREE.Group();

  const shell = new THREE.MeshStandardMaterial({
    color: 0x2a2f3d,
    metalness: 0.4,
    roughness: 0.6,
    emissive: 0x11141d,
    emissiveIntensity: 0.6,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x171a24,
    metalness: 0.3,
    roughness: 0.7,
    emissive: 0x0a0c12,
    emissiveIntensity: 0.6,
  });

  // Dashboard: a wide console across the bottom of the view, tilted toward you.
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.3), shell);
  dash.position.set(0, -0.33, -0.5);
  dash.rotation.x = 0.5;
  group.add(dash);

  // Cowl lip above the dash — the dark curve at the base of every windshield.
  const cowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 0.1, 24, 1, true, 0, Math.PI),
    trim,
  );
  cowl.rotation.z = Math.PI / 2;
  cowl.rotation.y = Math.PI / 2;
  cowl.scale.set(0.35, 1, 1);
  cowl.position.set(0, -0.245, -0.56);
  group.add(cowl);

  // A-pillars framing the windshield.
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.9, 0.06), trim);
    pillar.position.set(side * 0.42, 0.02, -0.52);
    pillar.rotation.z = side * -0.35;
    pillar.rotation.x = -0.12;
    group.add(pillar);
  }

  // Canopy header across the top edge.
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.16), trim);
  header.position.set(0, 0.285, -0.5);
  header.rotation.x = -0.35;
  group.add(header);

  // Instrument lights: little emissive clusters that bloom softly.
  const lightSpecs: Array<[number, number, number]> = [
    [-0.42, 0x53d8ff, 0.03],
    [-0.3, 0xffb454, 0.022],
    [-0.22, 0x7dffa8, 0.022],
    [0.24, 0xff6a6a, 0.022],
    [0.34, 0x53d8ff, 0.022],
    [0.44, 0xffd27d, 0.03],
  ];
  for (const [x, color, size] of lightSpecs) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, 0.005),
      new THREE.MeshBasicMaterial({ color }),
    );
    lamp.position.set(x, -0.188, -0.4);
    lamp.rotation.x = 0.5;
    group.add(lamp);
  }

  // Center nav screen, faintly alive.
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x0d2438 }),
  );
  screen.position.set(0, -0.183, -0.395);
  screen.rotation.x = -0.5;
  group.add(screen);

  // Soft cabin glow so the shell reads even in deep space.
  const cabin = new THREE.PointLight(0x8fb8ff, 0.6, 2.5, 2);
  cabin.position.set(0, 0.1, -0.2);
  group.add(cabin);

  group.visible = false;
  return group;
}
