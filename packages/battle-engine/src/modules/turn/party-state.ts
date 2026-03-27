import { PartyEntry } from '../party/party';

export function getActivePokemon(
  simulatedParties: Map<string, PartyEntry[]>,
  playerId: string,
) {
  const party = simulatedParties.get(playerId);
  if (!party || party.length === 0) {
    throw new Error(`No party available for player ${playerId}.`);
  }

  const active = party[0];
  if (!active) {
    throw new Error(`No active Pokemon for player ${playerId}.`);
  }

  return active;
}

export function hasHealthyPokemon(
  simulatedParties: Map<string, PartyEntry[]>,
  playerId: string,
) {
  const party = simulatedParties.get(playerId);
  if (!party || party.length === 0) {
    throw new Error(`No party available for player ${playerId}.`);
  }

  return party.some((pokemon) => pokemon.health > 0);
}

export function needsReplacement(
  simulatedParties: Map<string, PartyEntry[]>,
  playerId: string,
) {
  const party = simulatedParties.get(playerId);
  if (!party || party.length === 0) {
    throw new Error(`No party available for player ${playerId}.`);
  }

  const active = party[0];
  if (!active) {
    throw new Error(`No active Pokemon for player ${playerId}.`);
  }

  return active.health <= 0 && party.some((pokemon) => pokemon.health > 0);
}

export function getPendingReplacementPlayers(
  simulatedParties: Map<string, PartyEntry[]>,
  playerIds: string[],
) {
  return playerIds.filter((playerId) =>
    needsReplacement(simulatedParties, playerId),
  );
}
