import { difficulties } from './config';
import { add, clamp, dist, lerp, normalize, rnd, scale, sub } from './math';
import type { DifficultyKey, Entity, EntityKind, FishSizeClass, GameEvent, GameState, InputState } from './types';

const ARENA = { width: 960, height: 540 };
const BASE_PLAYER_RADIUS = 14;
const SIZE_STEP = 4;
const MAX_SIZE_TIER = 5;
const APEX_HIT_COOLDOWN_SECONDS = 0.45;
const NPC_SIZE_CLASSES: FishSizeClass[] = [1, 2, 3, 4];

const playerRadiusForSizeTier = (sizeTier: number) => {
  switch (Math.max(1, Math.min(MAX_SIZE_TIER, Math.round(sizeTier)))) {
    case 1: return 9;
    case 2: return 12;
    case 3: return 17;
    case 4: return 22;
    case 5: return 31;
    default: return BASE_PLAYER_RADIUS;
  }
};

const spawnRates: Record<EntityKind, keyof GameState['spawnTimers']> = {
  prey: 'prey',
  predator: 'predator',
  apex: 'apex',
  hazard: 'hazard',
};

const entitySpeed = (kind: EntityKind, aggression = 1): number => {
  switch (kind) {
    case 'prey': return rnd(70, 130);
    case 'predator': return rnd(95, 170) * (0.8 + aggression * 0.5);
    case 'apex': return rnd(140, 210) * (0.9 + aggression * 0.5);
    case 'hazard': return rnd(55, 105);
  }
};

const npcCruiseSpeed = (sizeClass: FishSizeClass) => {
  switch (sizeClass) {
    case 1: return rnd(95, 145);
    case 2: return rnd(85, 130);
    case 3: return rnd(78, 122);
    case 4: return rnd(72, 112);
    case 5: return rnd(70, 100);
  }
};

const chaseSpeed = (kind: EntityKind, aggression = 1): number => {
  if (kind === 'predator') return 95 + aggression * 55;
  if (kind === 'apex') return 120 + aggression * 75;
  return 0;
};

const npcRadiusForSizeClass = (sizeClass: FishSizeClass) => {
  switch (sizeClass) {
    case 1: return rnd(7, 10);
    case 2: return rnd(10, 14);
    case 3: return rnd(14, 19);
    case 4: return rnd(19, 25);
    case 5: return rnd(26, 36);
  }
};

const entityRadius = (kind: EntityKind, sizeClass?: FishSizeClass): number => {
  switch (kind) {
    case 'prey':
    case 'predator':
      return npcRadiusForSizeClass(sizeClass ?? (kind === 'prey' ? 1 : 3));
    case 'apex': return npcRadiusForSizeClass(5);
    case 'hazard': return rnd(14, 18);
  }
};

const fishExtents = (radius: number, scaleFactor: number) => ({
  // Include more of the visible fish silhouette (especially tail/body length) for fairer contact.
  rx: radius * 1.34 * scaleFactor,
  ry: radius * 0.78 * scaleFactor,
});

const countByKind = (state: GameState, kind: EntityKind) => state.entities.filter((e) => e.kind === kind).length;

const spawnCapForKind = (state: GameState, kind: EntityKind) => {
  const d = state.difficulty;
  if (kind === 'prey') return d.maxPrey;
  if (kind === 'predator') return d.maxPredators;
  if (kind === 'apex') return d.maxApex;
  return d.maxHazards;
};

const spawnRateForKind = (state: GameState, kind: EntityKind) => {
  const d = state.difficulty;
  if (kind === 'prey') return d.preySpawnPerSecond;
  if (kind === 'predator') return d.predatorSpawnPerSecond;
  if (kind === 'apex') return d.apexSpawnPerSecond;
  return d.hazardSpawnPerSecond;
};

const isKindUnlocked = (state: GameState, kind: EntityKind) => {
  const t = state.run.timeSeconds;
  const s = state.run.score;
  const size = state.player.sizeTier;
  if (kind === 'prey') return true;
  if (kind === 'predator') return t >= 2;
  if (kind === 'apex') {
    if (state.difficulty.key === 'easy') return t >= 24;
    if (state.difficulty.key === 'normal') return t >= 20;
    return t >= 16;
  }
  if (kind === 'hazard') {
    if (state.difficulty.key === 'easy') return t >= 38 && (s >= 2500 || size >= 4);
    if (state.difficulty.key === 'normal') return t >= 30 && (s >= 3200 || size >= 4);
    return t >= 22 && (s >= 4000 || size >= 4);
  }
  return true;
};

const pickNpcSizeForSpawn = (state: GameState, channel: 'prey' | 'predator'): FishSizeClass => {
  const p = state.player.sizeTier as FishSizeClass;
  const t = state.run.timeSeconds;
  const r = Math.random();

  if (channel === 'prey') {
    if (t < 12) return r < 0.8 ? 1 : 2;
    if (p <= 1) return r < 0.78 ? 1 : 2;
    if (p === 2) return r < 0.58 ? 1 : r < 0.93 ? 2 : 3;
    if (p === 3) return r < 0.18 ? 1 : r < 0.52 ? 2 : r < 0.92 ? 3 : 4;
    return r < 0.22 ? 2 : r < 0.62 ? 3 : 4;
  }

  // "predator" spawn channel now spawns larger food-chain fish sizes, but behavior is size-driven.
  if (t < 10) return 2;
  if (p <= 1) return r < 0.78 ? 2 : 3;
  if (p === 2) return r < 0.5 ? 2 : r < 0.92 ? 3 : 4;
  if (p === 3) return r < 0.42 ? 3 : 4;
  return r < 0.52 ? 3 : 4;
};

const isNpcEdible = (playerTier: number, npcSize: FishSizeClass) => npcSize <= playerTier;

const doesNpcAttackPlayer = (playerTier: number, npcSize: FishSizeClass) => npcSize > playerTier;

const canEat = (playerTier: number, entity: Entity) => {
  if ((entity.kind === 'prey' || entity.kind === 'predator') && entity.sizeClass) {
    return isNpcEdible(playerTier, entity.sizeClass);
  }
  if (entity.kind === 'apex') return false;
  return false;
};

const pointsForEat = (entity: Entity, multiplier: number) => {
  let base = 0;
  if ((entity.kind === 'prey' || entity.kind === 'predator') && entity.sizeClass) {
    base = entity.sizeClass === 1 ? 90 : entity.sizeClass === 2 ? 135 : entity.sizeClass === 3 ? 175 : 225;
  }
  return Math.floor(base * multiplier);
};

const pointsForApexTailHit = (multiplier: number) => Math.floor(500 * multiplier);
const apexTailDamageForPlayer = (playerTier: number) => (
  playerTier >= 5 ? 3 :
  playerTier >= 3 ? 2 : 1
);

const milestoneForScore = (score: number) => Math.floor(score / 1000);

const overlapsFishFootprint = (
  player: GameState['player'],
  entity: Entity,
  playerScale: number,
  enemyScale: number,
) => {
  const p = fishExtents(player.radius, playerScale);
  const e = entity.kind === 'hazard'
    ? { rx: entity.radius * enemyScale, ry: entity.radius * enemyScale }
    : fishExtents(entity.radius, enemyScale);
  if (entity.kind === 'apex') {
    e.rx *= 1.18;
    e.ry *= 0.96;
  }
  const dx = Math.abs(player.pos.x - entity.pos.x);
  const dy = Math.abs(player.pos.y - entity.pos.y);
  const rx = p.rx + e.rx;
  const ry = p.ry + e.ry;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
};

export const createInitialGameState = (difficultyKey: DifficultyKey): GameState => {
  const difficulty = difficulties[difficultyKey];
  return {
    seed: Math.floor(Math.random() * 1e9),
    elapsedMs: 0,
    mode: 'title',
    arena: ARENA,
    difficulty,
    player: {
      pos: { x: ARENA.width * 0.22, y: ARENA.height * 0.5 },
      vel: { x: 0, y: 0 },
      radius: playerRadiusForSizeTier(2),
      sizeTier: 2,
      lives: difficulty.startingLives,
      invulnerableUntil: 0,
    },
    entities: [],
    run: {
      score: 0,
      timeSeconds: 0,
      preyEaten: 0,
      predatorsAvoided: 0,
      nextGrowthScore: 1000,
      nextExtraLifeScore: 6000,
      milestone: 0,
    },
    nextEntityId: 1,
    spawnTimers: { prey: 0, predator: 0, apex: 0, hazard: 0 },
    apexThreat: {
      activeCount: 0,
      intensity: 0,
      lastHitAt: -999,
      lastKillAt: -999,
    },
    pendingEvents: [],
  };
};

export const startNewRun = (state: GameState): GameState => {
  const fresh = createInitialGameState(state.difficulty.key);
  fresh.mode = 'playing';
  return fresh;
};

export const setMode = (state: GameState, mode: GameState['mode']): GameState => ({ ...state, mode });

export const setDifficulty = (state: GameState, difficultyKey: DifficultyKey): GameState => {
  const next = createInitialGameState(difficultyKey);
  next.mode = 'title';
  return next;
};

const wrap = (state: GameState, e: { pos: { x: number; y: number }; radius: number }) => {
  if (e.pos.x < -e.radius) e.pos.x = state.arena.width + e.radius;
  if (e.pos.x > state.arena.width + e.radius) e.pos.x = -e.radius;
  if (e.pos.y < -e.radius) e.pos.y = state.arena.height + e.radius;
  if (e.pos.y > state.arena.height + e.radius) e.pos.y = -e.radius;
};

const spawnAtEdge = (state: GameState, kind: EntityKind): Entity => {
  const npcSize = (kind === 'prey' || kind === 'predator')
    ? pickNpcSizeForSpawn(state, kind)
    : undefined;
  const edge = Math.floor(rnd(0, 4));
  const radius = entityRadius(kind, npcSize);
  let pos = { x: 0, y: 0 };
  if (edge === 0) pos = { x: -radius, y: rnd(0, state.arena.height) };
  if (edge === 1) pos = { x: state.arena.width + radius, y: rnd(0, state.arena.height) };
  if (edge === 2) pos = { x: rnd(0, state.arena.width), y: -radius };
  if (edge === 3) pos = { x: rnd(0, state.arena.width), y: state.arena.height + radius };

  const toCenter = normalize(sub({ x: state.arena.width / 2, y: state.arena.height / 2 }, pos));
  const d = state.difficulty;
  const aggr = kind === 'predator' ? d.predatorAggression : kind === 'apex' ? d.apexAggression : 0.2;
  const randomBias = normalize({ x: rnd(-1, 1), y: rnd(-1, 1) });
  const heading = normalize({ x: lerp(randomBias.x, toCenter.x, aggr), y: lerp(randomBias.y, toCenter.y, aggr) });
  const speed = npcSize ? npcCruiseSpeed(npcSize) : entitySpeed(kind, aggr);

  const entity: Entity = {
    id: state.nextEntityId,
    kind,
    sizeClass: kind === 'apex' ? 5 : npcSize,
    variant: 1,
    pos,
    vel: scale(heading, speed),
    radius,
  };
  if (kind === 'apex') {
    const maxHealth = state.difficulty.apexMaxHealth;
    entity.combat = {
      maxHealth,
      health: maxHealth,
      tailWindowBias: rnd(0.52, 0.68),
      flashUntil: -1,
      lastHitAt: -999,
    };
  }
  return entity;
};

const maybeSpawn = (state: GameState, dt: number) => {
  (['prey', 'predator', 'apex', 'hazard'] as const).forEach((kind) => {
    if (!isKindUnlocked(state, kind)) return;
    state.spawnTimers[spawnRates[kind]] += dt;
    const rate = spawnRateForKind(state, kind);
    if (rate <= 0) return;
    const interval = 1 / rate;
    if (state.spawnTimers[kind] >= interval && countByKind(state, kind) < spawnCapForKind(state, kind)) {
      state.spawnTimers[kind] = 0;
      const entity = spawnAtEdge(state, kind);
      state.entities.push(entity);
      state.nextEntityId += 1;
    }
  });
};

const updateEntityAI = (state: GameState, entity: Entity, dt: number) => {
  if (entity.kind === 'prey' || entity.kind === 'predator') {
    const npcSize = entity.sizeClass ?? (entity.kind === 'prey' ? 1 : 3);
    const sizeDelta = npcSize - (state.player.sizeTier as FishSizeClass);
    const distanceToPlayer = dist(entity.pos, state.player.pos);

    if (!doesNpcAttackPlayer(state.player.sizeTier, npcSize) && distanceToPlayer < (68 + npcSize * 10)) {
      const away = normalize(sub(entity.pos, state.player.pos));
      const fleeSpeed = npcCruiseSpeed(npcSize) + 10;
      const target = scale(away, fleeSpeed);
      const fleeTurn = 0.025 + Math.max(0, (state.player.sizeTier - npcSize)) * 0.006;
      entity.vel.x = lerp(entity.vel.x, target.x, fleeTurn);
      entity.vel.y = lerp(entity.vel.y, target.y, fleeTurn);
    } else if (doesNpcAttackPlayer(state.player.sizeTier, npcSize)) {
      const chase = normalize(sub(state.player.pos, entity.pos));
      const aggression = clamp(state.difficulty.predatorAggression + Math.max(0, sizeDelta - 1) * 0.08, 0.2, 1);
      const targetSpeed = 88 + npcSize * 10 + aggression * 36;
      const target = scale(chase, targetSpeed);
      const turn = (0.022 + aggression * 0.045) * dt * 60;
      entity.vel.x = lerp(entity.vel.x, target.x, turn);
      entity.vel.y = lerp(entity.vel.y, target.y, turn);
    }
  }
  if (entity.kind === 'apex') {
    const chase = normalize(sub(state.player.pos, entity.pos));
    const aggression = state.difficulty.apexAggression;
    const targetSpeed = chaseSpeed(entity.kind, aggression);
    const target = scale(chase, targetSpeed);
    const turnBase = 0.018;
    const turnScale = 0.03;
    entity.vel.x = lerp(entity.vel.x, target.x, (turnBase + aggression * turnScale) * dt * 60);
    entity.vel.y = lerp(entity.vel.y, target.y, (turnBase + aggression * turnScale) * dt * 60);
  }
  if (entity.kind === 'hazard') {
    entity.vel.y += Math.sin((state.elapsedMs + entity.id * 47) / 400) * 0.4;
  }
  entity.pos = add(entity.pos, scale(entity.vel, dt));
  wrap(state, entity);
};

const resetPlayerAfterHit = (state: GameState) => {
  state.player.pos = { x: state.arena.width * 0.18, y: rnd(100, state.arena.height - 100) };
  state.player.vel = { x: 0, y: 0 };
  state.player.invulnerableUntil = state.run.timeSeconds + state.difficulty.graceSecondsAfterRespawn;
  state.entities = state.entities.filter((e) => dist(e.pos, state.player.pos) > 120);
};

const handlePlayerCollision = (state: GameState, entity: Entity): { consumed: boolean; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const d = state.difficulty;
  if (!overlapsFishFootprint(state.player, entity, d.playerHitboxScale, d.enemyHitboxScale)) {
    return { consumed: false, events };
  }

  const invulnerable = state.run.timeSeconds < state.player.invulnerableUntil;
  if (entity.kind === 'apex' && entity.combat) {
    const dx = state.player.pos.x - entity.pos.x;
    const apexFacingX = entity.vel.x === 0 ? 1 : Math.sign(entity.vel.x);
    const behindApex = dx * apexFacingX < 0;
    const tailBandWidth = entity.radius * (0.8 + entity.combat.tailWindowBias) * d.apexTailHitLeniency;
    const nearTail = Math.abs(dx) >= tailBandWidth * 0.24;
    const tailHitOpen = behindApex && nearTail;
    const hitCooldownReady = state.run.timeSeconds - entity.combat.lastHitAt >= APEX_HIT_COOLDOWN_SECONDS;

    if (tailHitOpen && hitCooldownReady) {
      entity.combat.lastHitAt = state.run.timeSeconds;
      entity.combat.flashUntil = state.run.timeSeconds + 0.18;
      const damage = apexTailDamageForPlayer(state.player.sizeTier);
      entity.combat.health -= damage;
      const points = pointsForApexTailHit(d.scoreMultiplier);
      state.run.score += points;
      state.apexThreat.lastHitAt = state.run.timeSeconds;
      const intensity = clamp(1 - entity.combat.health / entity.combat.maxHealth, 0, 1);
      state.apexThreat.intensity = Math.max(state.apexThreat.intensity, intensity);
      events.push({
        type: 'apex-hit',
        entityId: entity.id,
        damage,
        health: Math.max(entity.combat.health, 0),
        maxHealth: entity.combat.maxHealth,
        points,
        pos: { ...entity.pos },
      });
      events.push({ type: 'score', amount: points });
      events.push({ type: 'apex-intensity', value: state.apexThreat.intensity });
      if (entity.combat.health <= 0) {
        state.apexThreat.lastKillAt = state.run.timeSeconds;
        state.apexThreat.intensity = 0;
        const killBonus = points * 2;
        state.run.score += killBonus;
        events.push({ type: 'score', amount: killBonus });
        events.push({ type: 'apex-killed', entityId: entity.id, points: killBonus, pos: { ...entity.pos } });
        return { consumed: true, events };
      }
      return { consumed: false, events };
    }
  }
  const edible = canEat(state.player.sizeTier, entity);

  if (edible) {
    const points = pointsForEat(entity, d.scoreMultiplier);
    state.run.score += points;
    if (entity.kind === 'prey' || entity.kind === 'predator') state.run.preyEaten += 1;
    events.push({ type: 'eat', kind: entity.kind, sizeClass: entity.sizeClass }, { type: 'score', amount: points });
    return { consumed: true, events };
  }

  if (!invulnerable) {
    state.player.lives -= 1;
    events.push({ type: 'player-hit', livesRemaining: state.player.lives });
    if (state.player.lives <= 0) {
      state.mode = 'gameOver';
      events.push({ type: 'game-over', finalScore: state.run.score });
    } else {
      resetPlayerAfterHit(state);
    }
  }
  return { consumed: false, events };
};

const updateGrowthAndLives = (state: GameState) => {
  while (state.run.score >= state.run.nextGrowthScore) {
    if (state.player.sizeTier < MAX_SIZE_TIER) {
      state.player.sizeTier += 1;
      state.player.radius = playerRadiusForSizeTier(state.player.sizeTier);
      state.pendingEvents.push({ type: 'growth', sizeTier: state.player.sizeTier });
      state.run.nextGrowthScore += 1000;
      if (state.player.sizeTier === MAX_SIZE_TIER && state.run.nextExtraLifeScore < state.run.nextGrowthScore) {
        state.run.nextExtraLifeScore = state.run.nextGrowthScore;
      }
    } else {
      if (state.run.score >= state.run.nextExtraLifeScore) {
        state.player.lives += 1;
        state.pendingEvents.push({ type: 'extra-life', lives: state.player.lives });
        state.run.nextExtraLifeScore += state.difficulty.extraLifeScoreStep;
      } else {
        break;
      }
    }
  }

  const milestone = milestoneForScore(state.run.score);
  if (milestone > state.run.milestone) {
    state.run.milestone = milestone;
    state.pendingEvents.push({ type: 'milestone', value: milestone });
  }
};

const updateApexThreatState = (state: GameState) => {
  const apexEntities = state.entities.filter((e) => e.kind === 'apex');
  state.apexThreat.activeCount = apexEntities.length;
  if (apexEntities.length === 0) {
    state.apexThreat.intensity = Math.max(0, state.apexThreat.intensity - 0.02);
    return;
  }
  const aggregateDamage = apexEntities.reduce((sum, e) => {
    if (!e.combat) return sum;
    return sum + (1 - e.combat.health / e.combat.maxHealth);
  }, 0);
  const avgDamage = aggregateDamage / apexEntities.length;
  state.apexThreat.intensity = Math.max(state.apexThreat.intensity * 0.985, avgDamage);
};

export const tickGame = (prev: GameState, input: InputState, dtMs: number): GameState => {
  const state: GameState = {
    ...prev,
    elapsedMs: prev.elapsedMs + dtMs,
    run: { ...prev.run },
    player: { ...prev.player, pos: { ...prev.player.pos }, vel: { ...prev.player.vel } },
    entities: prev.entities.map((e) => ({
      ...e,
      pos: { ...e.pos },
      vel: { ...e.vel },
      combat: e.combat ? { ...e.combat } : undefined,
    })),
    spawnTimers: { ...prev.spawnTimers },
    apexThreat: { ...prev.apexThreat },
    pendingEvents: [],
  };

  if (input.pausePressed && state.mode === 'playing') state.mode = 'paused';
  else if (input.pausePressed && state.mode === 'paused') state.mode = 'playing';

  if (state.mode !== 'playing') return state;

  const dt = clamp(dtMs / 1000, 0, 0.05);
  state.run.timeSeconds += dt;

  maybeSpawn(state, dt);

  const moveDir = normalize(input.movement);
  const desiredVel = scale(moveDir, state.difficulty.playerSpeed);
  state.player.vel.x = lerp(state.player.vel.x, desiredVel.x, state.difficulty.playerTurnLerp);
  state.player.vel.y = lerp(state.player.vel.y, desiredVel.y, state.difficulty.playerTurnLerp);
  state.player.pos = add(state.player.pos, scale(state.player.vel, dt));
  state.player.pos.x = clamp(state.player.pos.x, 0, state.arena.width);
  state.player.pos.y = clamp(state.player.pos.y, 0, state.arena.height);

  state.entities.forEach((e) => updateEntityAI(state, e, dt));

  const survivors: Entity[] = [];
  for (const entity of state.entities) {
    const result = handlePlayerCollision(state, entity);
    state.pendingEvents.push(...result.events);
    if (!result.consumed) survivors.push(entity);
  }
  state.entities = survivors;

  updateGrowthAndLives(state);
  updateApexThreatState(state);
  return state;
};
