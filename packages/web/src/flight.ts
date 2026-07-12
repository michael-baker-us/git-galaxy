import * as THREE from "three";
import type { Spaceship } from "./scene/Spaceship";

/**
 * Third-person spaceship flight. Mouse (pointer-locked) steers pitch/yaw,
 * A/D rolls, W/S sets throttle, Shift boosts, Esc or F returns to orbit.
 * The camera chases the ship with critically-damped lerps so flight feels
 * smooth without a physics engine.
 */

const MIN_SPEED = 5;
const MAX_SPEED = 350;
const BOOST = 2.5;
const MOUSE_YAW = 0.0016;
const MOUSE_PITCH = 0.0013;
/** Drag steering (touch, or desktop without pointer lock) — shorter strokes, higher gain. */
const DRAG_YAW = 0.0042;
const DRAG_PITCH = 0.0034;
const ROLL_RATE = 1.9;
const THROTTLE_RATE = 90;

const FORWARD = new THREE.Vector3(0, 0, -1);
const CHASE_OFFSET = new THREE.Vector3(0, 2.4, 9.5);

export class FlightController {
  active = false;
  private speed = 40;
  private yawDelta = 0;
  private pitchDelta = 0;
  private dragPointer: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private readonly keys = new Set<string>();
  private readonly scratch = {
    q: new THREE.Quaternion(),
    axis: new THREE.Vector3(),
    v: new THREE.Vector3(),
  };

  constructor(
    private readonly ship: Spaceship,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: (active: boolean) => void,
  ) {
    ship.group.visible = false;

    window.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") this.toggle();
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("mousemove", (e) => {
      if (!this.active || document.pointerLockElement !== this.canvas) return;
      this.yawDelta -= e.movementX * MOUSE_YAW;
      this.pitchDelta -= e.movementY * MOUSE_PITCH;
    });

    // Drag steering: touch devices, and any environment without pointer lock.
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active || document.pointerLockElement === this.canvas) return;
      this.dragPointer = e.pointerId;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.active || this.dragPointer !== e.pointerId) return;
      this.yawDelta -= (e.clientX - this.dragX) * DRAG_YAW;
      this.pitchDelta -= (e.clientY - this.dragY) * DRAG_PITCH;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    });
    const endDrag = (e: PointerEvent) => {
      if (this.dragPointer === e.pointerId) this.dragPointer = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    // Esc releases pointer lock; on desktop that means leaving the cockpit.
    // (When lock was never acquired — touch — only the button/key exits.)
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement === this.canvas) {
        this.hadLock = true;
      } else if (this.active && this.hadLock) {
        this.exit();
      }
    });
  }

  private hadLock = false;

  /** Current speed as a 0..1 fraction of the throttle range. */
  throttleFraction(): number {
    return (this.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  }

  /** Touch throttle slider drives speed directly. */
  setThrottleFraction(f: number): void {
    this.speed = MIN_SPEED + Math.min(1, Math.max(0, f)) * (MAX_SPEED - MIN_SPEED);
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    const { group } = this.ship;
    group.visible = true;
    // Spawn just ahead of the current view, facing the same way.
    const dir = this.camera.getWorldDirection(this.scratch.v);
    group.position.copy(this.camera.position).addScaledVector(dir, 18);
    group.quaternion.copy(this.camera.quaternion);
    this.speed = 40;
    this.hadLock = false;
    // Touch devices skip pointer lock entirely — drag steering handles it.
    if (!window.matchMedia("(pointer: coarse)").matches) {
      try {
        // Chrome returns a promise that rejects in some environments (e.g.
        // headless); flight falls back to drag/keyboard steering without it.
        (this.canvas.requestPointerLock() as Promise<void> | undefined)?.catch(() => {});
      } catch {
        // pointer lock unavailable — drag steering still works
      }
    }
    this.onChange(true);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.ship.group.visible = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.camera.up.set(0, 1, 0);
    this.onChange(false);
  }

  /** Where the ship is heading — used to re-aim OrbitControls on exit. */
  lookTarget(out: THREE.Vector3): THREE.Vector3 {
    const dir = this.scratch.v.copy(FORWARD).applyQuaternion(this.ship.group.quaternion);
    return out.copy(this.ship.group.position).addScaledVector(dir, 80);
  }

  update(dt: number): void {
    if (!this.active) return;
    const { group } = this.ship;
    const { q, axis, v } = this.scratch;

    // Steering: consume accumulated mouse deltas, roll from keys.
    let roll = 0;
    if (this.keys.has("a")) roll += ROLL_RATE * dt;
    if (this.keys.has("d")) roll -= ROLL_RATE * dt;
    group.quaternion
      .multiply(q.setFromAxisAngle(axis.set(0, 1, 0), this.yawDelta))
      .multiply(q.setFromAxisAngle(axis.set(1, 0, 0), this.pitchDelta))
      .multiply(q.setFromAxisAngle(axis.set(0, 0, 1), roll));
    this.yawDelta = 0;
    this.pitchDelta = 0;

    // Throttle.
    if (this.keys.has("w")) this.speed += THROTTLE_RATE * dt;
    if (this.keys.has("s")) this.speed -= THROTTLE_RATE * dt;
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speed));
    const effective = this.speed * (this.keys.has("shift") ? BOOST : 1);

    v.copy(FORWARD).applyQuaternion(group.quaternion);
    group.position.addScaledVector(v, effective * dt);
    this.ship.setThrust(effective / (MAX_SPEED * BOOST));

    // Chase camera: damped follow in position and orientation.
    const desired = v.copy(CHASE_OFFSET).applyQuaternion(group.quaternion).add(group.position);
    this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    this.camera.quaternion.slerp(group.quaternion, 1 - Math.exp(-8 * dt));
  }
}
