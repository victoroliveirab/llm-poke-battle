const MIN_STAT_STAGE = -6;
const MAX_STAT_STAGE = 6;

export function clampBattleStage(stage: number) {
  const normalizedStage = Math.trunc(stage);
  return Math.max(MIN_STAT_STAGE, Math.min(MAX_STAT_STAGE, normalizedStage));
}

export function getAccuracyStageModifier(stage: number) {
  const clampedStage = clampBattleStage(stage);
  if (clampedStage >= 0) {
    return (3 + clampedStage) / 3;
  }

  return 3 / (3 + Math.abs(clampedStage));
}

export function calculateEffectiveAccuracy(
  moveAccuracy: number,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
) {
  const attackerModifier = getAccuracyStageModifier(attackerAccuracyStage);
  const defenderModifier = getAccuracyStageModifier(defenderEvasionStage);
  const rawChance = (moveAccuracy / 100) * (attackerModifier / defenderModifier);

  return Math.max(0, Math.min(1, rawChance));
}

export function didAttackLand(
  moveAccuracy: number,
  attackerAccuracyStage: number,
  defenderEvasionStage: number,
  random: () => number,
) {
  const effectiveAccuracy = calculateEffectiveAccuracy(
    moveAccuracy,
    attackerAccuracyStage,
    defenderEvasionStage,
  );

  return random() < effectiveAccuracy;
}

export function getModifiedBattleStat(stat: number, stage: number) {
  const modifier = getAccuracyStageModifier(stage);
  return stat * modifier;
}
