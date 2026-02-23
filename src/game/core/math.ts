import type { Vec2 } from './types';

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const len = (v: Vec2) => Math.hypot(v.x, v.y);
export const normalize = (v: Vec2): Vec2 => {
  const l = len(v);
  return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
};
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const rnd = (min: number, max: number) => min + Math.random() * (max - min);
