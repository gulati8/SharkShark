import type { Vec2 } from '../core/types';

export type JoystickSnapshot = {
  active: boolean;
  center: Vec2;
  knob: Vec2;
  vector: Vec2;
  radius: number;
};

export class VirtualJoystick {
  private pointerId: number | null = null;
  private center: Vec2 = { x: 0, y: 0 };
  private knob: Vec2 = { x: 0, y: 0 };
  private vector: Vec2 = { x: 0, y: 0 };
  private readonly radius = 52;

  onPointerDown = (e: PointerEvent) => {
    if (e.clientX > window.innerWidth * 0.5) return;
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
    const clamped = Math.min(this.radius, mag);
    const nx = dx / mag;
    const ny = dy / mag;
    this.knob = { x: this.center.x + nx * clamped, y: this.center.y + ny * clamped };
    this.vector = { x: dx / this.radius, y: dy / this.radius };
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
      radius: this.radius,
    };
  }
}
