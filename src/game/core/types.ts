export type DifficultyKey = 'easy' | 'normal' | 'hard';
export type PlayModeKey = 'arcade' | 'campaign' | 'challenges';

export type Vec2 = { x: number; y: number };
export type FishSizeClass = 1 | 2 | 3 | 4 | 5;

export type EntityKind = 'prey' | 'predator' | 'apex' | 'hazard';

export type Entity = {
  id: number;
  kind: EntityKind;
  sizeClass?: FishSizeClass;
  variant?: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  pointsOnEat?: number;
  combat?: {
    maxHealth: number;
    health: number;
    tailWindowBias: number;
    flashUntil: number;
    lastHitAt: number;
  };
};

export type DifficultyProfile = {
  key: DifficultyKey;
  label: string;
  scoreMultiplier: number;
  startingLives: number;
  playerSpeed: number;
  playerTurnLerp: number;
  playerHitboxScale: number;
  enemyHitboxScale: number;
  preySpawnPerSecond: number;
  predatorSpawnPerSecond: number;
  apexSpawnPerSecond: number;
  hazardSpawnPerSecond: number;
  maxPrey: number;
  maxPredators: number;
  maxApex: number;
  maxHazards: number;
  predatorAggression: number;
  apexAggression: number;
  apexMaxHealth: number;
  apexTailHitLeniency: number;
  reactionSmoothing: number;
  graceSecondsAfterRespawn: number;
  extraLifeScoreStep: number;
};

export type DifficultySet = Record<DifficultyKey, DifficultyProfile>;

export type GameSettings = {
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  controlMode: 'joystick' | 'drag';
};

export type Stats = {
  runsStarted: number;
  totalDeaths: number;
  totalPlaySeconds: number;
  totalPreyEaten: number;
  bestSizeTier: number;
};

export type MetaProgress = {
  highestMilestone: number;
  totalRuns: number;
};

export type CampaignProgress = {
  unlockedStage: number;
  completedStage: number;
  starsByStage: Record<string, number>;
};

export type ChallengeProgress = {
  completedIds: string[];
  bestById: Record<string, number>;
  dailyStreak: number;
};

export type SaveData = {
  version: number;
  selectedMode: PlayModeKey;
  selectedDifficulty: DifficultyKey;
  settings: GameSettings;
  highScores: Record<DifficultyKey, number>;
  stats: Stats;
  meta: MetaProgress;
  campaign: CampaignProgress;
  challenges: ChallengeProgress;
};

export type GameModeState = 'title' | 'playing' | 'paused' | 'gameOver';

export type PlayerState = {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  sizeTier: number;
  lives: number;
  invulnerableUntil: number;
};

export type RunProgress = {
  score: number;
  timeSeconds: number;
  preyEaten: number;
  predatorsAvoided: number;
  nextGrowthScore: number;
  nextExtraLifeScore: number;
  milestone: number;
};

export type GameState = {
  seed: number;
  elapsedMs: number;
  mode: GameModeState;
  arena: { width: number; height: number };
  difficulty: DifficultyProfile;
  player: PlayerState;
  entities: Entity[];
  run: RunProgress;
  nextEntityId: number;
  spawnTimers: Record<EntityKind, number>;
  apexThreat: {
    activeCount: number;
    intensity: number;
    lastHitAt: number;
    lastKillAt: number;
  };
  pendingEvents: GameEvent[];
};

export type InputState = {
  movement: Vec2;
  pausePressed: boolean;
};

export type GameEvent =
  | { type: 'score'; amount: number }
  | { type: 'eat'; kind: EntityKind; sizeClass?: FishSizeClass }
  | { type: 'player-hit'; livesRemaining: number }
  | { type: 'extra-life'; lives: number }
  | { type: 'growth'; sizeTier: number }
  | { type: 'game-over'; finalScore: number }
  | { type: 'milestone'; value: number }
  | { type: 'apex-hit'; entityId: number; damage: number; health: number; maxHealth: number; points: number; pos: Vec2 }
  | { type: 'apex-killed'; entityId: number; points: number; pos: Vec2 }
  | { type: 'apex-intensity'; value: number };
