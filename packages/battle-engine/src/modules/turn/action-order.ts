import { PartyEntry } from '../party/party';
import { TurnAction } from './types';

const PARALYSIS_SPEED_MODIFIER = 0.75;

export function getSpeedWithStatus(pokemon: PartyEntry) {
  const speedModifier = pokemon.isParalyzed ? PARALYSIS_SPEED_MODIFIER : 1;
  return pokemon.stats.speed * speedModifier;
}

export function getActionsInSpeedOrder(
  actionA: TurnAction,
  actionB: TurnAction,
  activePokemonA: PartyEntry,
  activePokemonB: PartyEntry,
  random: () => number,
): [TurnAction, TurnAction] {
  const activeSpeedA = getSpeedWithStatus(activePokemonA);
  const activeSpeedB = getSpeedWithStatus(activePokemonB);

  if (activeSpeedA > activeSpeedB) {
    return [actionA, actionB];
  }

  if (activeSpeedB > activeSpeedA) {
    return [actionB, actionA];
  }

  return random() < 0.5 ? [actionA, actionB] : [actionB, actionA];
}
