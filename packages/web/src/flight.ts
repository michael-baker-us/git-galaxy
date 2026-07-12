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
/** Tilt steering: degrees of device tilt past the deadzone act as a rate joystick. */
const TILT_DEADZONE_DEG = 2.5;
const TILT_CLAMP_DEG = 22;
const TILT_YAW_RATE = 1.5; // rad/s at full tilt
const TILT_PITCH_RATE = 1.1;
const ROLL_RATE = 1.9;
const THROTTLE_RATE = 90;

const FORWARD = new THREE.Vector3(0, 0, -1);
const CHASE_OFFSET = new THREE.Vector3(0, 2.4, 9.5);
/** Cockpit view: rigid at the nose — damping here reads as seasickness. */
const COCKPIT_OFFSET = new THREE.Vector3(0, 0.5, -0.4);

export type FlightView = "chase" | "cockpit";

export class FlightController {
  active = false;
  private speed = 40;
  private yawDelta = 0;
  private pitchDelta = 0;
  private dragPointer: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private throttleInput: -1 | 0 | 1 = 0;
  viewMode: FlightView = "chase";
  tiltEnabled = false;
  private tiltBaseline: { beta: number; gamma: number } | null = null;
  private tiltNow: { beta: number; gamma: number } | null = null;
  private tiltPendingBaseline = false;
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

    window.addEventListener("deviceorientation", (e) => {
      if (e.beta === null || e.gamma === null) return;
      this.tiltNow = { beta: e.beta, gamma: e.gamma };
      if (this.tiltPendingBaseline) {
        this.tiltBaseline = { ...this.tiltNow };
        this.tiltPendingBaseline = false;
      }
    });

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

  /** Held throttle rocker: -1 slower, +1 faster, 0 hold speed (same ramp as W/S). */
  setThrottleInput(direction: -1 | 0 | 1): void {
    this.throttleInput = direction;
  }

  get currentSpeed(): number {
    return this.speed;
  }

  /** Chase ↔ cockpit. In the cockpit the hull hides — you ARE the ship. */
  toggleView(): void {
    this.viewMode = this.viewMode === "chase" ? "cockpit" : "chase";
    if (this.active) this.ship.group.visible = this.viewMode === "chase";
  }

  /**
   * Tilt-to-steer. Resolves false when the device refuses (iOS requires a
   * user-gesture permission; desktops have no sensor).
   */
  async enableTilt(): Promise<boolean> {
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE?.requestPermission === "function") {
      try {
        if ((await DOE.requestPermission()) !== "granted") return false;
      } catch {
        return false;
      }
    }
    this.tiltEnabled = true;
    this.recenterTilt();
    return true;
  }

  disableTilt(): void {
    this.tiltEnabled = false;
    this.tiltBaseline = null;
  }

  /** Current grip becomes the neutral position (next sensor reading). */
  recenterTilt(): void {
    this.tiltPendingBaseline = true;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    const { group } = this.ship;
    group.visible = this.viewMode === "chase";
    // Spawn just ahead of the current view, facing the same way.
    const dir = this.camera.getWorldDirection(this.scratch.v);
    group.position.copy(this.camera.position).addScaledVector(dir, 18);
    group.quaternion.copy(this.camera.quaternion);
    this.speed = 40;
    this.hadLock = false;
    // Whatever way the phone is held right now is level flight.
    if (this.tiltEnabled) this.recenterTilt();
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
    this.throttleInput = 0; // a finger may still be down on the rocker
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

    // Tilt steering: offsets from the neutral grip act as a rate joystick —
    // hold a tilt, keep turning. Deadzone kills hand tremor.
    if (this.tiltEnabled && this.tiltBaseline && this.tiltNow) {
      const axis = (delta: number): number => {
        const past = Math.max(0, Math.abs(delta) - TILT_DEADZONE_DEG);
        return (Math.sign(delta) * Math.min(past, TILT_CLAMP_DEG)) / TILT_CLAMP_DEG;
      };
      // Roll the phone to yaw; tilt it toward/away to pitch.
      this.yawDelta -= axis(this.tiltNow.gamma - this.tiltBaseline.gamma) * TILT_YAW_RATE * dt;
      this.pitchDelta += axis(this.tiltNow.beta - this.tiltBaseline.beta) * TILT_PITCH_RATE * dt;
    }

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

    // Throttle: keyboard or the held touch rocker.
    if (this.keys.has("w")) this.speed += THROTTLE_RATE * dt;
    if (this.keys.has("s")) this.speed -= THROTTLE_RATE * dt;
    this.speed += THROTTLE_RATE * this.throttleInput * dt;
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speed));
    const effective = this.speed * (this.keys.has("shift") ? BOOST : 1);

    v.copy(FORWARD).applyQuaternion(group.quaternion);
    group.position.addScaledVector(v, effective * dt);
    this.ship.setThrust(effective / (MAX_SPEED * BOOST));

    if (this.viewMode === "cockpit") {
      // Rigid mount at the nose: what the ship does, you feel instantly.
      this.camera.position
        .copy(v.copy(COCKPIT_OFFSET).applyQuaternion(group.quaternion))
        .add(group.position);
      this.camera.quaternion.copy(group.quaternion);
    } else {
      // Chase camera: damped follow in position and orientation.
      const desired = v.copy(CHASE_OFFSET).applyQuaternion(group.quaternion).add(group.position);
      this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
      this.camera.quaternion.slerp(group.quaternion, 1 - Math.exp(-8 * dt));
    }
  }
}
