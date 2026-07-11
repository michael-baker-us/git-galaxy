import * as THREE from "three";

/** Floating repo-name label rendered onto a canvas texture. */
export function createLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

  const font = "48px ui-monospace, Menlo, monospace";
  ctx.font = font;
  const padding = 24;
  canvas.width = Math.ceil(ctx.measureText(text).width) + padding * 2;
  canvas.height = 96;
  ctx.font = font; // canvas resize resets state
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 30, 0.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(214, 224, 255, 0.92)";
  ctx.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  const height = 7;
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
  return sprite;
}
