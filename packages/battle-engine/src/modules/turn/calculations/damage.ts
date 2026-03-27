type DamageParams = {
  level: number;
  power: number;
  attack: number;
  defense: number;
  stab: number;
  typeEffectiveness: number;
  critical: boolean;
  random: () => number;
};

export function calculateDamage(params: DamageParams) {
  const baseDamage =
    (((2 * params.level) / 5 + 2) *
      params.power *
      (params.attack / params.defense)) /
      50 +
    2;
  const randomFactor = params.random() * (1.0 - 0.85) + 0.85;
  const criticalModifier = params.critical ? 1.5 : 1.0;
  const modifiers =
    params.stab * params.typeEffectiveness * criticalModifier * randomFactor;

  return Math.floor(baseDamage * modifiers);
}
