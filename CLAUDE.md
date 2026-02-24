# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev`
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Preview production build:** `npm run preview`
- No test framework or linter is configured.

## Deployment

Merges to `main` trigger a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds, syncs to S3 (`reefrush-gulatilabs`), and invalidates CloudFront (`EXRUTHBUEX0EK`). The site is served at `https://reefrush.gulatilabs.me` via Caddy reverse proxy on EC2 → CloudFront → S3.

## Architecture

React + Phaser 3 game with strict TypeScript. Three layers communicate via a bridge pattern:

```
React (App.tsx) ←→ SceneBridge ←→ Phaser (GameScene.ts) → engine.tickGame()
```

### Game Engine (`src/game/core/engine.ts`)
Pure, deterministic game logic. `tickGame(state, input, dtMs)` returns a new immutable `GameState` each frame. Handles spawning, AI, collision detection (elliptical hitboxes), scoring, and growth. No rendering or side effects.

### Phaser Scene (`src/game/phaser/GameScene.ts`)
Rendering-only layer. Calls `tickGame()` each frame, syncs sprites, draws particles/effects/backgrounds. Communicates with React through `SceneBridge` callbacks (push state/events out, pull input in).

### React UI (`src/app/App.tsx`)
Orchestrates everything: manages save data, input systems, SFX engine, and HUD. The game fills the full viewport; settings/stats/difficulty are in an overlay menu. Wraps Phaser via `GameCanvas.tsx` which creates the Phaser.Game instance (960×540, `Scale.FIT`).

### Supporting Systems
- **Input** (`src/game/input/`): `KeyboardInput` (WASD/arrows) and `VirtualJoystick` (relative drag — touch anywhere to anchor, drag to steer) produce a unified `InputState` each frame.
- **Audio** (`src/game/audio/sfx.ts`): `SfxEngine` synthesizes all sounds via Web Audio API (no audio files). Three buses: master, music, sfx.
- **Persistence** (`src/game/persistence/localStore.ts`): localStorage save/load with smart schema merging (key: `reef-rush-save-v1`).
- **Theme** (`src/game/theme/`): Pluggable color/sprite config. Currently only `reefTheme`.

## Key Game Mechanics

- **Food chain**: Fish have 5 size tiers. Player eats fish ≤ their tier; larger fish attack. Growth every 1000 points.
- **Apex predators**: Boss sharks that chase the player. Front 70% damages the player; back 30% (tail zone) is where the player damages the shark (0.45s cooldown, 2-4 HP based on difficulty).
- **Difficulty**: Three profiles (easy/normal/hard) control 15+ parameters: spawn rates, aggression, hitbox scales, score multipliers, lives.
- **Entity AI**: Prey flees, predators chase if larger than player, apex always chases, hazards drift.
- **Debug mode**: Press G in-game to toggle hitbox visualization.

## Assets

Sprites live in `public/assets/reef/`. All fish/hazard sprites are 1024×1024 canvases with the fish baked in at progressive sizes (s1=25%, s2=34%, s3=49%, s4=66%, s5=63%, apex=92%). The engine displays all sprites at a constant 200×200px (`SPRITE_DISPLAY_SIZE`); visual size differences come from the art. Collision radii are derived from these baked sizes (~85% coverage).

Naming convention:
- Player: `player_s{1-5}_a.png` (size tiers)
- NPCs: `npc_s{1-4}_v1_a.png`
- Apex: `apex_s5_v1_a.png`, `apex_s5_v1_hit.png`
- Hazard: `hazard_v1_a.png`
- Backgrounds: `bg_far.png`, `bg_mid.png`, `caustics.png`, `bg_fore_{left,right}.png`
- Originals backed up in `public/assets/reef/originals/`
