import { defaultSaveData } from '../core/config';
import type { DifficultyKey, SaveData } from '../core/types';

const STORAGE_KEY = 'reef-rush-save-v1';

export const loadSaveData = (): SaveData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultSaveData);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...structuredClone(defaultSaveData),
      ...parsed,
      settings: { ...defaultSaveData.settings, ...(parsed.settings ?? {}) },
      highScores: { ...defaultSaveData.highScores, ...(parsed.highScores ?? {}) },
      stats: { ...defaultSaveData.stats, ...(parsed.stats ?? {}) },
      meta: { ...defaultSaveData.meta, ...(parsed.meta ?? {}) },
      campaign: { ...defaultSaveData.campaign, ...(parsed.campaign ?? {}) },
      challenges: { ...defaultSaveData.challenges, ...(parsed.challenges ?? {}) },
    };
  } catch {
    return structuredClone(defaultSaveData);
  }
};

export const saveSaveData = (data: SaveData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const updateAfterRun = (save: SaveData, difficulty: DifficultyKey, score: number, playSeconds: number, preyEaten: number, bestSize: number): SaveData => {
  const next: SaveData = structuredClone(save);
  next.highScores[difficulty] = Math.max(next.highScores[difficulty], score);
  next.stats.runsStarted = Math.max(next.stats.runsStarted, next.meta.totalRuns);
  next.stats.totalDeaths += 1;
  next.stats.totalPlaySeconds += playSeconds;
  next.stats.totalPreyEaten += preyEaten;
  next.stats.bestSizeTier = Math.max(next.stats.bestSizeTier, bestSize);
  next.meta.highestMilestone = Math.max(next.meta.highestMilestone, Math.floor(score / 1000));
  if (score >= 1000) {
    next.campaign.unlockedStage = Math.max(next.campaign.unlockedStage, 2);
  }
  return next;
};
