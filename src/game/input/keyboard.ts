import type { Vec2 } from '../core/types';

export class KeyboardInput {
  private pressed = new Set<string>();
  private pauseQueued = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  destroy(target: Window = window) {
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'escape', 'p', 'enter'].includes(key)) {
      e.preventDefault();
    }
    this.pressed.add(key);
    if (key === 'p' || key === 'escape') this.pauseQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.key.toLowerCase());
  };

  readMovement(): Vec2 {
    const left = this.pressed.has('arrowleft') || this.pressed.has('a') ? -1 : 0;
    const right = this.pressed.has('arrowright') || this.pressed.has('d') ? 1 : 0;
    const up = this.pressed.has('arrowup') || this.pressed.has('w') ? -1 : 0;
    const down = this.pressed.has('arrowdown') || this.pressed.has('s') ? 1 : 0;
    return { x: left + right, y: up + down };
  }

  consumePausePressed() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  consumeStartPressed() {
    return this.pressed.has('enter') || this.pressed.has(' ');
  }
}
