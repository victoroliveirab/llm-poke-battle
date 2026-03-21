const MIN_CRITICAL_STAGE = 0;
const CRITICAL_GUARANTEED_STAGE = 3;

const CRITICAL_HIT_CHANCE_BY_STAGE: Record<0 | 1 | 2, number> = {
  0: 1 / 24,
  1: 1 / 8,
  2: 1 / 2,
};

export function clampCriticalStage(stage: number) {
  const normalizedStage = Math.trunc(stage);
  return Math.max(MIN_CRITICAL_STAGE, normalizedStage);
}

export function getCriticalHitChance(stage: number) {
  const clampedStage = clampCriticalStage(stage);
  if (clampedStage >= CRITICAL_GUARANTEED_STAGE) {
    return 1;
  }

  return CRITICAL_HIT_CHANCE_BY_STAGE[clampedStage as 0 | 1 | 2];
}

export function isCriticalHit(stage: number, random: () => number) {
  const chance = getCriticalHitChance(stage);
  return random() < chance;
}
