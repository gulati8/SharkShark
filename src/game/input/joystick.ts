import type { Vec2 } from '../core/types';

export type JoystickSnapshot = {
  active: boolean;
  center: Vec2;
  knob: Vec2;
  vector: Vec2;
  radius: number;
};

/**
 * Relative-drag input: touch anywhere to set an anchor, drag to steer.
 * The movement vector ramps to full magnitude over `sensitivity` px of drag distance.
 */
export class VirtualJoystick {
  private pointerId: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };
  private knob: Vec2 = { x: 0, y: 0 };
  private vector: Vec2 = { x: 0, y: 0 };
  /** Distance in screen px at which drag reaches full-speed input. */
  private readonly sensitivity = 40;

  onPointerDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.center = { x: e.clientX, y: e.clientY };
    this.knob = { ...this.center };
    this.vector = { x: 0, y: 0 };
  };

  onPointerMove = (e: PointerEvent) => {
    if (this.pointerId !== e.pointerId) return;
    const dx = e.clientX - this.center.x;
    const dy = e.clientY - this.center.y;
    const mag = Math.hypot(dx, dy) || 1;
    const t = Math.min(1, mag / this.sensitivity);
    this.knob = { x: e.clientX, y: e.clientY };
    this.vector = { x: (dx / mag) * t, y: (dy / mag) * t };
  };

  onPointerUp = (e: PointerEvent) => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
  };

  getMovement(): Vec2 {
    return { ...this.vector };
  }

  snapshot(): JoystickSnapshot {
    return {
      active: this.pointerId !== null,
      center: { ...this.center },
      knob: { ...this.knob },
      vector: { ...this.vector },
      radius: this.sensitivity,
    };
  }
}
