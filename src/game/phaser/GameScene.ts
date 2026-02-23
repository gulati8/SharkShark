import Phaser from 'phaser';
import { createInitialGameState, setDifficulty, setMode, startNewRun, tickGame } from '../core/engine';
import type { DifficultyKey, Entity, GameEvent, GameState, InputState } from '../core/types';
import type { ThemeConfig } from '../theme';

export type SceneBridge = {
  getInputState: () => InputState;
  onState: (state: GameState) => void;
  onEvents: (events: GameEvent[]) => void;
  onRunStarted: () => void;
  onRunEnded: (state: GameState) => void;
  shouldStartRun: () => boolean;
  consumeStartRun: () => void;
  shouldRestartRun: () => boolean;
  consumeRestartRun: () => void;
  shouldTogglePause: () => boolean;
  consumeTogglePause: () => void;
  getDifficulty: () => DifficultyKey;
};

export class GameScene extends Phaser.Scene {
  private static readonly USE_APEX_HIT_SPRITE = true;
  private static readonly USE_HAZARD_FRAME_B = true;
  private static readonly USE_BG_MID_IMAGE = true;
  private static readonly USE_BG_FORE_IMAGE = false;
  private static readonly USE_CAUSTICS_IMAGE = true;
  private state!: GameState;
  private bridge!: SceneBridge;
  private theme!: ThemeConfig;
  private gfx!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private bgFarSprite?: Phaser.GameObjects.Image;
  private bgMidSprite?: Phaser.GameObjects.Image;
  private bgCausticsSprite?: Phaser.GameObjects.Image;
  private bgForeLeftSprite?: Phaser.GameObjects.Image;
  private bgForeRightSprite?: Phaser.GameObjects.Image;
  private bgForeSprite?: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private entitySprites = new Map<number, Phaser.GameObjects.Image>();
  private floatTexts: Array<{ text: Phaser.GameObjects.Text; vx: number; vy: number; ttl: number }> = [];
  private particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; ttl: number; color: number }> = [];
  private bubbles: Array<{ x: number; y: number; r: number; speed: number; drift: number; phase: number; alpha: number }> = [];
  private threatPulse = 0;
  private lastApexHitAtMs = -99999;
  private lastApexKillAtMs = -99999;
  private debugGeometry = false;

  constructor() {
    super('GameScene');
  }

  init(data: { bridge: SceneBridge; theme: ThemeConfig }) {
    this.bridge = data.bridge;
    this.theme = data.theme;
    this.state = createInitialGameState(this.bridge.getDifficulty());
  }

  preload() {
    const { sprites } = this.theme;
    // Future size-class/player evolution assets (safe to predeclare; missing files just won't be selected).
    for (const size of [1, 2, 3, 4, 5]) {
      this.load.image(`player-s${size}-a`, `/assets/reef/player_s${size}_a.png`);
      this.load.image(`player-s${size}-b`, `/assets/reef/player_s${size}_b.png`);
    }
    for (const size of [1, 2, 3, 4]) {
      this.load.image(`npc-s${size}-v1-a`, `/assets/reef/npc_s${size}_v1_a.png`);
      this.load.image(`npc-s${size}-v1-b`, `/assets/reef/npc_s${size}_v1_b.png`);
    }
    this.load.image('apex-s5-v1-a', '/assets/reef/apex_s5_v1_a.png');
    this.load.image('apex-s5-v1-b', '/assets/reef/apex_s5_v1_b.png');
    this.load.image('apex-s5-v1-hit', '/assets/reef/apex_s5_v1_hit.png');
    this.load.image('hazard-v1-a', '/assets/reef/hazard_v1_a.png');
    this.load.image('hazard-v1-b', '/assets/reef/hazard_v1_b.png');
    this.load.image('reef-bg-far', '/assets/reef/bg_far.png');
    this.load.image('reef-bg-mid', '/assets/reef/bg_mid.png');
    this.load.image('reef-bg-fore', '/assets/reef/bg_fore.png');
    this.load.image('reef-bg-fore-left', '/assets/reef/bg_fore_left.png');
    this.load.image('reef-bg-fore-right', '/assets/reef/bg_fore_right.png');
    this.load.image('reef-caustics', '/assets/reef/caustics.png');

    // Current hand-generated first batch / fallback assets
    this.load.image('reef-player-a', '/assets/reef/player_swim_a.png');
    this.load.image('reef-player-b', '/assets/reef/player_swim_b.png');
    this.load.image('reef-prey-a', '/assets/reef/prey_01_a.png');
    this.load.image('reef-prey-b', '/assets/reef/prey_01_b.png');
    this.load.image('reef-apex-a', '/assets/reef/apex_01_a.png');
    this.load.image('reef-apex-b', '/assets/reef/apex_01_b.png');
    this.load.image('reef-apex-hit', '/assets/reef/apex_01_hit.png');
    this.load.svg('reef-predator', sprites.predator);
    this.load.svg('reef-hazard', sprites.hazard);
  }

  create() {
    this.cameras.main.setBackgroundColor(this.theme.background);
    if (this.textures.exists('reef-bg-far')) {
      this.bgFarSprite = this.add.image(this.state.arena.width / 2, this.state.arena.height / 2, 'reef-bg-far')
        .setDepth(-5)
        .setDisplaySize(this.state.arena.width, this.state.arena.height)
        .setAlpha(0.92);
    }
    if (GameScene.USE_BG_MID_IMAGE && this.textures.exists('reef-bg-mid')) {
      this.bgMidSprite = this.add.image(this.state.arena.width / 2, this.state.arena.height / 2, 'reef-bg-mid')
        .setDepth(-4)
        .setDisplaySize(this.state.arena.width, this.state.arena.height)
        .setAlpha(0.7);
    }
    this.gfx = this.add.graphics();
    this.gfx.setDepth(0);
    this.debugGfx = this.add.graphics();
    this.debugGfx.setDepth(30);
    if (GameScene.USE_CAUSTICS_IMAGE && this.textures.exists('reef-caustics')) {
      this.bgCausticsSprite = this.add.image(this.state.arena.width / 2, this.state.arena.height / 2, 'reef-caustics')
        .setDepth(3)
        .setDisplaySize(this.state.arena.width, this.state.arena.height)
        .setAlpha(0.16)
        .setBlendMode(Phaser.BlendModes.ADD);
    }
    if (this.textures.exists('reef-bg-fore-left')) {
      this.bgForeLeftSprite = this.add.image(0, this.state.arena.height, 'reef-bg-fore-left')
        .setOrigin(0, 1)
        .setDepth(8)
        .setDisplaySize(320, 320)
        .setAlpha(0.92);
    }
    if (this.textures.exists('reef-bg-fore-right')) {
      this.bgForeRightSprite = this.add.image(this.state.arena.width, this.state.arena.height, 'reef-bg-fore-right')
        .setOrigin(1, 1)
        .setDepth(8)
        .setDisplaySize(320, 320)
        .setAlpha(0.92);
    }
    if (GameScene.USE_BG_FORE_IMAGE && this.textures.exists('reef-bg-fore')) {
      this.bgForeSprite = this.add.image(this.state.arena.width / 2, this.state.arena.height / 2, 'reef-bg-fore')
        .setDepth(8)
        .setDisplaySize(this.state.arena.width, this.state.arena.height)
        .setAlpha(0.92)
        // The generated foreground still has a light checker/white matte baked in.
        // Multiply blend suppresses the matte while preserving darker coral/rock shapes.
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    this.playerSprite = this.add.image(0, 0, 'reef-player-a').setDepth(5);
    this.playerSprite.setOrigin(0.5);
    this.bubbles = Array.from({ length: 26 }, (_, i) => ({
      x: Phaser.Math.Between(0, 960),
      y: Phaser.Math.Between(0, 540),
      r: Phaser.Math.FloatBetween(1.5, 5.5),
      speed: Phaser.Math.FloatBetween(8, 26),
      drift: Phaser.Math.FloatBetween(4, 18),
      phase: i * 17 + Phaser.Math.FloatBetween(0, 100),
      alpha: Phaser.Math.FloatBetween(0.08, 0.22),
    }));
    this.input.keyboard?.on('keydown-G', () => {
      this.debugGeometry = !this.debugGeometry;
    });
    this.bridge.onState(this.state);
  }

  update(_time: number, delta: number) {
    if (this.state.difficulty.key !== this.bridge.getDifficulty()) {
      this.state = setDifficulty(this.state, this.bridge.getDifficulty());
    }

    if (this.bridge.shouldStartRun() && this.state.mode === 'title') {
      this.bridge.consumeStartRun();
      this.state = startNewRun(this.state);
      this.bridge.onRunStarted();
    }

    if (this.bridge.shouldRestartRun() && this.state.mode === 'gameOver') {
      this.bridge.consumeRestartRun();
      this.state = startNewRun(this.state);
      this.bridge.onRunStarted();
    }

    if (this.bridge.shouldTogglePause()) {
      this.bridge.consumeTogglePause();
      this.state = setMode(this.state, this.state.mode === 'paused' ? 'playing' : this.state.mode === 'playing' ? 'paused' : this.state.mode);
    }

    const input = this.bridge.getInputState();
    this.state = tickGame(this.state, input, delta);

    if (this.state.pendingEvents.length > 0) {
      this.handleSceneEvents(this.state.pendingEvents);
      this.bridge.onEvents(this.state.pendingEvents);
      if (this.state.pendingEvents.some((e) => e.type === 'game-over')) {
        this.bridge.onRunEnded(this.state);
      }
    }

    this.bridge.onState(this.state);
    this.updateBackdropLayers();
    this.renderState();
  }

  private updateBackdropLayers() {
    if (this.bgCausticsSprite) {
      const t = this.state.elapsedMs;
      this.bgCausticsSprite.setAlpha(0.12 + Math.sin(t / 900) * 0.02 + this.state.apexThreat.intensity * 0.04);
      this.bgCausticsSprite.setRotation(Math.sin(t / 5000) * 0.01);
      this.bgCausticsSprite.setPosition(
        this.state.arena.width / 2 + Math.sin(t / 2200) * 3,
        this.state.arena.height / 2 + Math.cos(t / 2600) * 2,
      );
    }
    if (this.bgForeLeftSprite) {
      const t = this.state.elapsedMs;
      this.bgForeLeftSprite.setPosition(
        0 + Math.sin(t / 3000) * 1.5,
        this.state.arena.height + Math.cos(t / 2600) * 1.2,
      );
    }
    if (this.bgForeRightSprite) {
      const t = this.state.elapsedMs;
      this.bgForeRightSprite.setPosition(
        this.state.arena.width + Math.sin(t / 3200 + 1.2) * 1.4,
        this.state.arena.height + Math.cos(t / 2800 + 0.8) * 1.2,
      );
    }
  }

  private renderState() {
    this.gfx.clear();
    this.debugGfx.clear();
    this.updateFloatTexts();
    this.updateParticles();

    const pulse = Math.max(0, this.threatPulse * 0.985);
    this.threatPulse = pulse;
    const dangerOverlay = Phaser.Math.Clamp(this.state.apexThreat.intensity * 0.35 + pulse, 0, 0.5);
    this.drawWaterBackdrop(dangerOverlay);
    this.syncEntitySprites();

    this.gfx.lineStyle(3, 0x2d7ea2, 0.75);
    this.gfx.strokeRoundedRect(2, 2, this.state.arena.width - 4, this.state.arena.height - 4, 14);
    this.gfx.lineStyle(1, 0x9ae9ff, 0.12);
    this.gfx.strokeRoundedRect(8, 8, this.state.arena.width - 16, this.state.arena.height - 16, 12);

    for (const e of this.state.entities) {
      const color = e.kind === 'prey'
        ? this.theme.preyColor
        : e.kind === 'predator'
          ? this.theme.predatorColor
          : e.kind === 'apex'
            ? this.theme.apexColor
            : this.theme.hazardColor;
      this.gfx.fillStyle(color, e.kind === 'hazard' ? 0.7 : 0.95);
      if (e.kind === 'hazard') {
        this.gfx.lineStyle(1, 0xffffff, 0.4);
        this.gfx.strokeCircle(e.pos.x, e.pos.y, e.radius + 2);
        this.gfx.lineStyle(1, 0xc18bff, 0.22);
        this.gfx.strokeCircle(e.pos.x, e.pos.y, e.radius + 6 + Math.sin((this.state.elapsedMs + e.id * 33) / 180) * 1.5);
      } else {
        if (e.kind === 'apex') {
          this.gfx.fillStyle(0xff5c5c, 0.05 + this.state.apexThreat.intensity * 0.14);
          this.gfx.fillEllipse(e.pos.x, e.pos.y, e.radius * 3.6, e.radius * 2.35);
          this.gfx.lineStyle(1, 0xffb7b7, 0.12 + this.state.apexThreat.intensity * 0.12);
          this.gfx.strokeEllipse(e.pos.x, e.pos.y, e.radius * 3.3, e.radius * 2.1);
        }
      }
    }

    const invuln = this.state.run.timeSeconds < this.state.player.invulnerableUntil;
    const alpha = invuln ? 0.4 + Math.abs(Math.sin(this.state.elapsedMs / 90)) * 0.5 : 1;
    this.syncPlayerSprite(alpha);
    if (this.debugGeometry) this.drawDebugGeometry();
    this.drawVignette();
    this.drawParticles();
  }

  private debugFishExtents(radius: number, scaleFactor: number) {
    return { rx: radius * 1.34 * scaleFactor, ry: radius * 0.78 * scaleFactor };
  }

  private drawDebugGeometry() {
    const g = this.debugGfx;
    const d = this.state.difficulty;
    const p = this.debugFishExtents(this.state.player.radius, d.playerHitboxScale);
    // Player contact footprint (prominent)
    g.fillStyle(0x34ff8f, 0.12);
    g.fillEllipse(this.state.player.pos.x, this.state.player.pos.y, p.rx * 2, p.ry * 2);
    g.lineStyle(3, 0x4dff9a, 1);
    g.strokeEllipse(this.state.player.pos.x, this.state.player.pos.y, p.rx * 2, p.ry * 2);
    g.lineStyle(2, 0xb8ffe1, 0.95);
    g.strokeLineShape(new Phaser.Geom.Line(this.state.player.pos.x - 8, this.state.player.pos.y, this.state.player.pos.x + 8, this.state.player.pos.y));
    g.strokeLineShape(new Phaser.Geom.Line(this.state.player.pos.x, this.state.player.pos.y - 8, this.state.player.pos.x, this.state.player.pos.y + 8));

    for (const e of this.state.entities) {
      const isFish = e.kind !== 'hazard';
      const ext = e.kind === 'hazard'
        ? { rx: e.radius * d.enemyHitboxScale, ry: e.radius * d.enemyHitboxScale }
        : this.debugFishExtents(e.radius, d.enemyHitboxScale);
      if (e.kind === 'apex') {
        ext.rx *= 1.18;
        ext.ry *= 0.96;
      }

      const color =
        e.kind === 'apex' ? 0xff6b6b :
        e.kind === 'hazard' ? 0xc18bff :
        ((e.sizeClass ?? 1) <= this.state.player.sizeTier ? 0x6dffde : 0xffb15c);
      g.fillStyle(color, e.kind === 'apex' ? 0.08 : 0.06);
      g.lineStyle(2, color, 0.9);
      if (isFish) {
        g.fillEllipse(e.pos.x, e.pos.y, ext.rx * 2, ext.ry * 2);
        g.strokeEllipse(e.pos.x, e.pos.y, ext.rx * 2, ext.ry * 2);
      } else {
        g.fillCircle(e.pos.x, e.pos.y, ext.rx);
        g.strokeCircle(e.pos.x, e.pos.y, ext.rx);
      }
      g.lineStyle(1, 0xffffff, 0.35);
      g.strokeLineShape(new Phaser.Geom.Line(e.pos.x - 5, e.pos.y, e.pos.x + 5, e.pos.y));
      g.strokeLineShape(new Phaser.Geom.Line(e.pos.x, e.pos.y - 5, e.pos.x, e.pos.y + 5));

      if (e.kind === 'apex' && e.combat) {
        const facingX = e.vel.x === 0 ? 1 : Math.sign(e.vel.x);
        const tailBandWidth = e.radius * (0.8 + e.combat.tailWindowBias) * d.apexTailHitLeniency;
        const tailThreshold = tailBandWidth * 0.24;
        // Shark zones: red body = danger contact, yellow tail = player damage zone.
        g.lineStyle(2, 0xffe58f, 0.95);
        g.lineBetween(e.pos.x, e.pos.y - 40, e.pos.x, e.pos.y + 40);
        g.lineStyle(2, 0xffd38b, 0.9);
        g.lineBetween(e.pos.x - facingX * tailThreshold, e.pos.y - 34, e.pos.x - facingX * tailThreshold, e.pos.y + 34);
        const tailX = facingX > 0 ? e.pos.x - ext.rx : e.pos.x + tailThreshold;
        const tailW = Math.max(1, ext.rx - tailThreshold);
        g.fillStyle(0xffd38b, 0.22);
        g.fillRect(tailX, e.pos.y - ext.ry, tailW, ext.ry * 2);
      }
    }
  }

  private drawFish(x: number, y: number, r: number, color: number, facing: 1 | -1, alpha = 1, showTailCue = false) {
    const outline = showTailCue ? 0x2b0910 : 0x072132;
    this.gfx.fillStyle(0x03131e, alpha * 0.24);
    this.gfx.fillEllipse(x + 2, y + 5, r * 2.1, r * 1.1);
    this.gfx.lineStyle(Math.max(1, r * 0.07), outline, alpha * 0.55);
    this.gfx.strokeEllipse(x, y, r * 2.2, r * 1.35);
    this.gfx.fillStyle(color, alpha);
    this.gfx.fillEllipse(x, y, r * 2.2, r * 1.35);
    this.gfx.lineStyle(Math.max(1, r * 0.06), outline, alpha * 0.55);
    this.gfx.strokeTriangle(
      x - facing * (r * 1.2), y,
      x - facing * (r * 2.0), y - r * 0.8,
      x - facing * (r * 2.0), y + r * 0.8,
    );
    this.gfx.fillStyle(0xffffff, alpha * 0.08);
    this.gfx.fillEllipse(x + facing * (r * 0.12), y - r * 0.2, r * 1.25, r * 0.36);
    this.gfx.fillStyle(0xffffff, alpha * 0.16);
    this.gfx.fillEllipse(x + facing * (r * 0.7), y - r * 0.42, r * 0.38, r * 0.16);
    this.gfx.fillTriangle(
      x - facing * (r * 1.2), y,
      x - facing * (r * 2.0), y - r * 0.8,
      x - facing * (r * 2.0), y + r * 0.8,
    );
    if (showTailCue) {
      this.gfx.fillStyle(0xffd38b, Math.max(0.16, 0.14 + this.state.apexThreat.intensity * 0.28));
      this.gfx.fillTriangle(
        x - facing * (r * 1.15), y,
        x - facing * (r * 1.9), y - r * 0.72,
        x - facing * (r * 1.9), y + r * 0.72,
      );
    }
    this.gfx.fillStyle(showTailCue ? 0x2d0e16 : 0x08243a, alpha);
    this.gfx.fillCircle(x + facing * (r * 0.65), y - r * 0.22, Math.max(1.6, r * 0.16));
    this.gfx.fillStyle(0xffffff, alpha * 0.9);
    this.gfx.fillCircle(x + facing * (r * 0.72), y - r * 0.28, Math.max(0.7, r * 0.05));
  }

  private spriteKeyForEntity(entity: Entity) {
    const swimFrameB = Math.floor(this.state.elapsedMs / 180) % 2 === 1;
    if (entity.kind === 'prey' || entity.kind === 'predator') {
      const size = entity.sizeClass ?? (entity.kind === 'prey' ? 1 : 3);
      const frame = swimFrameB ? 'b' : 'a';
      const preferred = `npc-s${size}-v1-${frame}`;
      if (this.textures.exists(preferred)) return preferred;
      if (size <= 2) return swimFrameB ? 'reef-prey-b' : 'reef-prey-a';
      return 'reef-predator';
    }
    if (entity.kind === 'apex') {
      const flashing = !!(entity.combat && this.state.run.timeSeconds < entity.combat.flashUntil);
      if (flashing && GameScene.USE_APEX_HIT_SPRITE && this.textures.exists('apex-s5-v1-hit')) return 'apex-s5-v1-hit';
      const preferred = swimFrameB ? 'apex-s5-v1-b' : 'apex-s5-v1-a';
      if (this.textures.exists(preferred)) return preferred;
      if (flashing && GameScene.USE_APEX_HIT_SPRITE) return 'reef-apex-hit';
      return swimFrameB ? 'reef-apex-b' : 'reef-apex-a';
    }
    if (GameScene.USE_HAZARD_FRAME_B) {
      const hazardFrame = swimFrameB ? 'hazard-v1-b' : 'hazard-v1-a';
      if (this.textures.exists(hazardFrame)) return hazardFrame;
    } else if (this.textures.exists('hazard-v1-a')) {
      return 'hazard-v1-a';
    }
    return 'reef-hazard';
  }

  private targetDisplayWidthForEntity(entity: Entity) {
    if (entity.kind === 'prey' || entity.kind === 'predator') {
      const size = entity.sizeClass ?? (entity.kind === 'prey' ? 1 : 3);
      if (size === 1) return entity.radius * 5.6;
      if (size === 2) return entity.radius * 5.7;
      if (size === 3) return entity.radius * 5.8;
      return entity.radius * 6.0;
    }
    if (entity.kind === 'apex') return entity.radius * 6.2;
    return entity.radius * 3.4;
  }

  private syncEntitySprites() {
    const ids = new Set<number>();
    for (const entity of this.state.entities) {
      ids.add(entity.id);
      let sprite = this.entitySprites.get(entity.id);
      const textureKey = this.spriteKeyForEntity(entity);
      if (!sprite) {
        sprite = this.add.image(0, 0, textureKey).setDepth(entity.kind === 'hazard' ? 4 : 5);
        sprite.setOrigin(0.5);
        this.entitySprites.set(entity.id, sprite);
      } else if (sprite.texture.key !== textureKey) {
        sprite.setTexture(textureKey);
      }
      const targetW = this.targetDisplayWidthForEntity(entity);
      sprite.setPosition(entity.pos.x, entity.pos.y);
      sprite.setDisplaySize(targetW, targetW);
      if (entity.kind !== 'hazard') {
        const facingLeft = entity.vel.x < 0;
        const facingSign = facingLeft ? -1 : 1;
        sprite.setFlipX(facingLeft);
        const sway = Math.sin((this.state.elapsedMs / 120) + entity.id * 0.6) * 0.03;
        const bank = Math.atan2(entity.vel.y, Math.max(20, Math.abs(entity.vel.x))) * 0.45 * facingSign;
        sprite.setRotation(bank + sway);
        sprite.setScale(sprite.scaleX, sprite.scaleY * (0.98 + Math.sin((this.state.elapsedMs / 140) + entity.id) * 0.02));
      } else {
        sprite.setRotation(Math.sin((this.state.elapsedMs + entity.id * 40) / 220) * 0.06);
      }
      if (entity.kind === 'apex') {
        const flashing = !!(entity.combat && this.state.run.timeSeconds < entity.combat.flashUntil);
        if (flashing) sprite.setTintFill(0xffffff);
        else sprite.clearTint();
      } else {
        sprite.clearTint();
      }
    }
    for (const [id, sprite] of this.entitySprites) {
      if (!ids.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private syncPlayerSprite(alpha: number) {
    const frameB = Math.floor(this.state.elapsedMs / 170) % 2 === 1;
    const playerVisualSize = Math.min(5, Math.max(1, this.state.player.sizeTier));
    const preferred = `player-s${playerVisualSize}-${frameB ? 'b' : 'a'}`;
    const textureKey = this.textures.exists(preferred) ? preferred : (frameB ? 'reef-player-b' : 'reef-player-a');
    if (this.playerSprite.texture.key !== textureKey) this.playerSprite.setTexture(textureKey);
    const size = Math.min(5, Math.max(1, this.state.player.sizeTier));
    const sizeMult = size === 1 ? 5.6 : size === 2 ? 5.7 : size === 3 ? 5.8 : size === 4 ? 6.0 : 6.2;
    const targetW = this.state.player.radius * sizeMult;
    this.playerSprite.setPosition(this.state.player.pos.x, this.state.player.pos.y);
    this.playerSprite.setDisplaySize(targetW, targetW);
    const facingLeft = this.state.player.vel.x < 0;
    const facingSign = facingLeft ? -1 : 1;
    this.playerSprite.setFlipX(facingLeft);
    const bob = Math.sin(this.state.elapsedMs / 140) * 0.025;
    const bank = Math.atan2(this.state.player.vel.y, Math.max(20, Math.abs(this.state.player.vel.x))) * 0.45 * facingSign;
    this.playerSprite.setRotation(bank + bob);
    this.playerSprite.setAlpha(alpha);
  }

  private handleSceneEvents(events: GameEvent[]) {
    for (const event of events) {
      if (event.type === 'apex-hit') {
        this.lastApexHitAtMs = this.time.now;
        this.threatPulse = Math.min(0.35, this.threatPulse + 0.12);
        this.spawnFloatingText(event.pos.x, event.pos.y - 12, `+${event.points}`, '#ffd38b');
        this.spawnBurst(event.pos.x, event.pos.y, 3, 0xffd38b, 26);
      }
      if (event.type === 'apex-killed') {
        this.lastApexKillAtMs = this.time.now;
        this.threatPulse = 0.5;
        this.spawnFloatingText(event.pos.x, event.pos.y - 22, `APEX DOWN +${event.points}`, '#ff9f9f');
        this.spawnBurst(event.pos.x, event.pos.y, 18, 0xff9f9f, 84);
      }
      if (event.type === 'eat') {
        const p = this.state.player.pos;
        this.spawnBurst(p.x, p.y, 3, 0xa8ffe7, 24);
      }
      if (event.type === 'player-hit') {
        const p = this.state.player.pos;
        this.spawnBurst(p.x, p.y, 10, 0xff7f6a, 70);
      }
    }
  }

  private spawnFloatingText(x: number, y: number, value: string, color: string) {
    const text = this.add.text(x, y, value, {
      fontFamily: 'Trebuchet MS, Verdana, sans-serif',
      fontSize: '17px',
      fontStyle: '700',
      color,
      stroke: '#061622',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.floatTexts.push({ text, vx: Phaser.Math.FloatBetween(-6, 6), vy: -28, ttl: 900 });
  }

  private updateFloatTexts() {
    if (this.floatTexts.length === 0) return;
    const dt = this.game.loop.delta;
    this.floatTexts = this.floatTexts.filter((f) => {
      f.ttl -= dt;
      f.text.x += (f.vx * dt) / 1000;
      f.text.y += (f.vy * dt) / 1000;
      f.text.setAlpha(Math.max(0, Math.min(1, f.ttl / 900)));
      if (f.ttl <= 0) {
        f.text.destroy();
        return false;
      }
      return true;
    });
  }

  private drawWaterBackdrop(dangerOverlay: number) {
    const hasBgFar = !!this.bgFarSprite;
    if (!hasBgFar) {
      this.gfx.fillStyle(0x071827, 1);
      this.gfx.fillRect(0, 0, this.state.arena.width, this.state.arena.height);
      this.gfx.fillStyle(0x0a2e46, 0.55);
      this.gfx.fillEllipse(210, 82, 390, 170);
      this.gfx.fillStyle(0x0f5067, 0.22);
      this.gfx.fillEllipse(760, 120, 470, 210);
    } else {
      // Subtle tint and atmospheric pulse over the art background.
      this.gfx.fillStyle(0x04111b, 0.12);
      this.gfx.fillRect(0, 0, this.state.arena.width, this.state.arena.height);
    }
    this.gfx.fillStyle(0x7ceaff, 0.05);
    for (let y = 24; y < this.state.arena.height; y += 34) {
      this.gfx.fillRect(0, y + Math.sin((this.state.elapsedMs / 450) + y) * 2, this.state.arena.width, 1);
    }
    if (!this.bgMidSprite) {
      this.gfx.fillStyle(0x0b2f40, 0.35);
      for (let i = 0; i < 6; i += 1) {
        const x = (i * 172 + (this.state.elapsedMs * 0.02)) % (this.state.arena.width + 90) - 45;
        const y = 420 + Math.sin((this.state.elapsedMs / 700) + i) * 6;
        this.gfx.fillEllipse(x, y, 95, 22);
      }
    }
    this.gfx.fillStyle(0xe5fbff, 0.06);
    for (let i = 0; i < 12; i += 1) {
      const x = (i * 90 + (this.state.elapsedMs * 0.06)) % (this.state.arena.width + 80) - 20;
      const y = 52 + Math.sin(i + this.state.elapsedMs / 600) * 8;
      this.gfx.fillEllipse(x, y, 58, 6);
    }
    for (const b of this.bubbles) {
      b.y -= (b.speed * this.game.loop.delta) / 1000;
      b.x += Math.sin((this.state.elapsedMs / 1000) + b.phase) * 0.15 * b.drift;
      if (b.y < -12) {
        b.y = this.state.arena.height + Phaser.Math.Between(4, 28);
        b.x = Phaser.Math.Between(0, this.state.arena.width);
      }
      if (b.x < -12) b.x = this.state.arena.width + 8;
      if (b.x > this.state.arena.width + 12) b.x = -8;
      this.gfx.lineStyle(1, 0xc7f5ff, b.alpha);
      this.gfx.strokeCircle(b.x, b.y, b.r);
    }
    if (dangerOverlay > 0.01) {
      this.gfx.fillStyle(0xa11212, dangerOverlay * 0.25);
      this.gfx.fillRect(0, 0, this.state.arena.width, this.state.arena.height);
      this.gfx.fillStyle(0xff7a7a, dangerOverlay * 0.06);
      this.gfx.fillEllipse(this.state.arena.width * 0.55, this.state.arena.height * 0.5, 760, 420);
    }
  }

  private drawVignette() {
    this.gfx.fillStyle(0x02090f, 0.2);
    this.gfx.fillRect(0, 0, this.state.arena.width, 30);
    this.gfx.fillRect(0, this.state.arena.height - 30, this.state.arena.width, 30);
    this.gfx.fillRect(0, 0, 30, this.state.arena.height);
    this.gfx.fillRect(this.state.arena.width - 30, 0, 30, this.state.arena.height);
    this.gfx.fillStyle(0xa8f2ff, 0.03);
    this.gfx.fillRect(0, 0, this.state.arena.width, 10);
  }

  private spawnBurst(x: number, y: number, count: number, color: number, speed: number) {
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const vel = Phaser.Math.FloatBetween(speed * 0.4, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        r: Phaser.Math.FloatBetween(1.4, 3.4),
        ttl: Phaser.Math.FloatBetween(180, 420),
        color,
      });
    }
  }

  private updateParticles() {
    if (this.particles.length === 0) return;
    const dt = this.game.loop.delta;
    this.particles = this.particles.filter((p) => {
      p.ttl -= dt;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vx *= 0.985;
      p.vy *= 0.985;
      return p.ttl > 0;
    });
  }

  private drawParticles() {
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.ttl / 420));
      this.gfx.fillStyle(p.color, a * 0.9);
      this.gfx.fillCircle(p.x, p.y, p.r);
    }
  }
}
