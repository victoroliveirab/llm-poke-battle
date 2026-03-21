import { executeMove } from '../../moves/executor';
import { DomainEvent } from '../../../../engine/events';
import { PLAYER_ONE_ID, PLAYER_TWO_ID } from './shared';
import { createTurnStateFixture } from './turn-state-fixture';

type MoveFixtureParams = Parameters<typeof createTurnStateFixture>[0];

export function createMoveFixture(params: MoveFixtureParams = {}) {
  const fixture = createTurnStateFixture(params);

  return {
    ...fixture,
    execute(attackerMove: string, defenderMove: string) {
      const events: DomainEvent[] = [];
      const result = executeMove({
        attackerAction: fixture.attack(PLAYER_ONE_ID, attackerMove),
        defenderAction: fixture.attack(PLAYER_TWO_ID, defenderMove),
        events,
        getSpecies: fixture.getSpecies,
        random: fixture.random,
        simulatedParties: fixture.simulatedParties,
        statusHandlerRegistry: params.statusHandlerRegistry,
      });

      return { events, result };
    },
  };
}
