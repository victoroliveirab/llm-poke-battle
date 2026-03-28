import { describe, expect, it } from 'bun:test';
import { createSessionState, type SessionState } from '../sessionState';
import {
  captureRoomTurnSnapshot,
  getRoom,
  listRoomTurnSnapshots,
} from '../rooms';
import { selectPartyController } from './selectPartyController';
import { joinRoomController } from './joinRoomController';
import { playMoveController } from './playMoveController';
import { startGameController } from './startGameController';

type SessionSetup = {
  roomHandle: string;
  player1Session: SessionState;
  player2Session: SessionState;
};

type MutableParty = {
  getPokemonByName: (name: string) =>
    | {
        moves: Array<{
          name: string;
          accuracy: number;
          power: number;
          statChanges?: Array<{
            target: 'self' | 'opponent';
            stat:
              | 'accuracy'
              | 'attack'
              | 'critical'
              | 'defense'
              | 'evasion'
              | 'specialAttack'
              | 'specialDefense';
            stages: number;
          }>;
        }>;
      }
    | undefined;
};

function parseJsonPayload(responseText: string): Record<string, unknown> {
  const parsed = JSON.parse(responseText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected JSON object payload.');
  }

  return parsed as Record<string, unknown>;
}

async function setupGameLoop(): Promise<SessionSetup> {
  const player1Session = createSessionState();
  const player2Session = createSessionState();

  const creatorJoin = await joinRoomController.handle(
    {},
    { sessionState: player1Session },
  );
  const roomHandle = parseJsonPayload(
    creatorJoin.content[0]?.text ?? '{}',
  ).room_handle;
  if (typeof roomHandle !== 'string' || roomHandle.length === 0) {
    throw new Error('Expected room handle from creator join.');
  }

  await joinRoomController.handle(
    { room_handle: roomHandle },
    { sessionState: player2Session },
  );

  await startGameController.handle(
    { room_handle: roomHandle },
    { sessionState: player1Session },
  );

  const partyArgs = {
    room_handle: roomHandle,
    p1: 'Charizard',
    p2: 'Raichu',
    p3: 'Nidoking',
    p1_reason: 'Lead with Charizard for immediate pressure and broad coverage.',
    p2_reason:
      'Raichu gives speed control and electric coverage from the bench.',
    p3_reason:
      'Nidoking provides physical coverage and mid-game pivot options.',
    lead_reason:
      'Charizard opens because it has the safest opening attacks into most matchups and establishes tempo.',
  };
  await selectPartyController.handle(partyArgs, {
    sessionState: player1Session,
  });
  await selectPartyController.handle(partyArgs, {
    sessionState: player2Session,
  });

  return {
    roomHandle,
    player1Session,
    player2Session,
  };
}

async function setupGameLoopWithParty(params: {
  player1Party: {
    p1: string;
    p2: string;
    p3: string;
  };
  player2Party: {
    p1: string;
    p2: string;
    p3: string;
  };
}): Promise<SessionSetup> {
  const player1Session = createSessionState();
  const player2Session = createSessionState();

  const creatorJoin = await joinRoomController.handle(
    {},
    { sessionState: player1Session },
  );
  const roomHandle = parseJsonPayload(
    creatorJoin.content[0]?.text ?? '{}',
  ).room_handle;
  if (typeof roomHandle !== 'string' || roomHandle.length === 0) {
    throw new Error('Expected room handle from creator join.');
  }

  await joinRoomController.handle(
    { room_handle: roomHandle },
    { sessionState: player2Session },
  );

  await startGameController.handle(
    { room_handle: roomHandle },
    { sessionState: player1Session },
  );

  await selectPartyController.handle(
    {
      room_handle: roomHandle,
      ...params.player1Party,
      p1_reason: `${params.player1Party.p1} leads for early pressure.`,
      p2_reason: `${params.player1Party.p2} provides bench support.`,
      p3_reason: `${params.player1Party.p3} covers the remaining matchups.`,
      lead_reason: `${params.player1Party.p1} is the intended opener.`,
    },
    { sessionState: player1Session },
  );
  await selectPartyController.handle(
    {
      room_handle: roomHandle,
      ...params.player2Party,
      p1_reason: `${params.player2Party.p1} leads for early pressure.`,
      p2_reason: `${params.player2Party.p2} provides bench support.`,
      p3_reason: `${params.player2Party.p3} covers the remaining matchups.`,
      lead_reason: `${params.player2Party.p1} is the intended opener.`,
    },
    { sessionState: player2Session },
  );

  return {
    roomHandle,
    player1Session,
    player2Session,
  };
}

describe('play_move reasoning requirement', () => {
  it('throws when attack reasoning is missing', async () => {
    const setup = await setupGameLoop();

    expect(() =>
      playMoveController.handle(
        {
          room_handle: setup.roomHandle,
          action: {
            type: 'attack',
            payload: {
              attackName: 'Fire Punch',
            },
          },
        },
        { sessionState: setup.player1Session },
      ),
    ).toThrow('action.reasoning');
  });

  it('throws when switch reasoning is empty', async () => {
    const setup = await setupGameLoop();

    expect(() =>
      playMoveController.handle(
        {
          room_handle: setup.roomHandle,
          action: {
            type: 'switch',
            reasoning: '   ',
            payload: {
              newPokemon: 'Raichu',
            },
          },
        },
        { sessionState: setup.player1Session },
      ),
    ).toThrow('action.reasoning');
  });

  it('stores attack reasoning in submitted actions and timeline snapshots', async () => {
    const setup = await setupGameLoop();
    const player1Reasoning =
      'Fire Punch is a safe neutral hit and keeps pressure this turn.';
    const player2Reasoning =
      'Mirror pressure with Fire Punch while preserving bench options.';

    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player1Reasoning,
          payload: {
            attackName: 'Fire Punch',
          },
        },
      },
      { sessionState: setup.player1Session },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player2Reasoning,
          payload: {
            attackName: 'Fire Punch',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const room = getRoom(setup.roomHandle);
    if (!room) {
      throw new Error('Expected room to exist for snapshot assertions.');
    }

    const snapshots = listRoomTurnSnapshots(room, 1);
    const snapshot = snapshots[0];
    if (!snapshot) {
      throw new Error('Expected at least one turn snapshot.');
    }

    expect(snapshot.actions.player1.submittedAction?.reasoning).toBe(
      player1Reasoning,
    );
    expect(snapshot.actions.player2.submittedAction?.reasoning).toBe(
      player2Reasoning,
    );

    const attackTimeline = snapshot.actions.timeline.filter(
      (entry) => entry.type === 'attack',
    );
    expect(attackTimeline.length).toBeGreaterThanOrEqual(2);
    expect(
      attackTimeline.some((entry) => entry.reasoning === player1Reasoning),
    ).toBe(true);
    expect(
      attackTimeline.some((entry) => entry.reasoning === player2Reasoning),
    ).toBe(true);
    expect(
      attackTimeline.every((entry) => typeof entry.critical === 'boolean'),
    ).toBe(true);
  });

  it('includes pokemon gender in turn snapshots', async () => {
    const setup = await setupGameLoopWithParty({
      player1Party: {
        p1: 'Magnezone',
        p2: 'Raichu',
        p3: 'Nidoking',
      },
      player2Party: {
        p1: 'Magnezone',
        p2: 'Raichu',
        p3: 'Charizard',
      },
    });

    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: 'Thunderbolt is the strongest neutral opening attack.',
          payload: {
            attackName: 'Thunderbolt',
          },
        },
      },
      { sessionState: setup.player1Session },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: 'Mirror the opener with reliable damage.',
          payload: {
            attackName: 'Thunderbolt',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const room = getRoom(setup.roomHandle);
    if (!room) {
      throw new Error('Expected room to exist for gender snapshot assertions.');
    }

    const snapshot = listRoomTurnSnapshots(room, 1)[0];
    if (!snapshot) {
      throw new Error('Expected at least one turn snapshot.');
    }

    expect(snapshot.player1.active.gender).toBe('genderless');
    expect(snapshot.player2.active.gender).toBe('genderless');
    expect(snapshot.player1.bench[1]?.gender).toBe('male');
  });

  it('includes makesContact in room snapshots', async () => {
    const setup = await setupGameLoop();
    const room = getRoom(setup.roomHandle);
    if (!room) {
      throw new Error('Expected room to exist for move snapshot assertions.');
    }

    const snapshot = captureRoomTurnSnapshot(room, 1);
    const strength = snapshot.player1.active.moves.find(
      (move) => move.name === 'Strength',
    );
    const firePunch = snapshot.player1.active.moves.find(
      (move) => move.name === 'Fire Punch',
    );

    expect(strength?.makesContact).toBe(true);
    expect(firePunch?.makesContact).toBe(true);
  });

  it('records infatuation application and immobilized-by-love outcomes in turn snapshots', async () => {
    const setup = await setupGameLoop();
    const room = getRoom(setup.roomHandle);
    if (!room || !room.game) {
      throw new Error(
        'Expected room game to exist for infatuation snapshot assertions.',
      );
    }

    const player1Id = setup.player1Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error(
        'Expected player ids for infatuation snapshot assertions.',
      );
    }

    const internals = room.game as unknown as {
      context: unknown;
      partyModule: {
        onEvent: (event: unknown, context: unknown) => unknown[];
      };
    };
    internals.partyModule.onEvent(
      {
        type: 'pokemon.volatile_status_changed',
        playerId: player2Id,
        pokemonName: 'Charizard',
        status: {
          kind: 'infatuation',
        },
        active: true,
        sourcePlayerId: player1Id,
        moveName: 'Attract',
      },
      internals.context,
    );

    type ResolutionDetails = NonNullable<
      Parameters<typeof captureRoomTurnSnapshot>[2]
    >;
    const resolutionDetails: ResolutionDetails = {
      emittedEvents: [
        {
          type: 'pokemon.volatile_status_changed',
          playerId: player2Id,
          pokemonName: 'Charizard',
          status: {
            kind: 'infatuation',
          },
          active: true,
          sourcePlayerId: player1Id,
          moveName: 'Attract',
        },
        {
          type: 'attack.infatuated',
          playerId: player2Id,
          targetPlayerId: player1Id,
          pokemonName: 'Charizard',
          targetPokemonName: 'Charizard',
          moveName: 'Strength',
        },
      ],
      preTurnActivePokemonByPlayerId: new Map([
        [player1Id, 'Charizard'],
        [player2Id, 'Charizard'],
      ]),
      submittedActionsByPlayerId: new Map([
        [
          player1Id,
          {
            type: 'attack',
            attackName: 'Attract',
            reasoning: 'Apply infatuation before the opponent can respond.',
          },
        ],
        [
          player2Id,
          {
            type: 'attack',
            attackName: 'Strength',
            reasoning: 'Attack if infatuation does not block the move.',
          },
        ],
      ]),
      pendingInterTurnSwitchesByPlayerId: new Map(),
    };

    const snapshot = captureRoomTurnSnapshot(room, 1, resolutionDetails);

    expect(snapshot.player2.active.volatileStatuses).toEqual([
      { kind: 'infatuation' },
    ]);
    expect(
      snapshot.actions.timeline.some(
        (entry) =>
          entry.type === 'attack' &&
          entry.playerId === player1Id &&
          entry.outcome === 'status' &&
          entry.status === 'infatuation' &&
          entry.active === true,
      ),
    ).toBe(true);
    expect(
      snapshot.actions.timeline.some(
        (entry) =>
          entry.type === 'attack' &&
          entry.playerId === player2Id &&
          entry.outcome === 'infatuated' &&
          entry.reasoning === 'Attack if infatuation does not block the move.',
      ),
    ).toBe(true);
  });

  it('includes burn residual damage in turn snapshots', async () => {
    const setup = await setupGameLoop();
    const room = getRoom(setup.roomHandle);
    if (!room || !room.game) {
      throw new Error(
        'Expected room game to exist for burn snapshot assertions.',
      );
    }
    const playerTwoId = setup.player2Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    if (!playerTwoId) {
      throw new Error('Expected player two id for burn snapshot assertions.');
    }

    const internals = room.game as unknown as {
      context: unknown;
      partyModule: {
        onEvent: (event: unknown, context: unknown) => unknown[];
      };
    };
    internals.partyModule.onEvent(
      {
        type: 'pokemon.major_status_changed',
        playerId: playerTwoId,
        pokemonName: 'Charizard',
        status: {
          kind: 'burn',
        },
        active: true,
        sourcePlayerId: 'player-one',
        moveName: 'Fire Punch',
      },
      internals.context,
    );

    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: 'Switch tempo while burn chip accumulates.',
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player1Session },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning:
            'Attempt a miss so burn damage is the only chip this turn.',
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const snapshot = listRoomTurnSnapshots(room, 1)[0];
    if (!snapshot) {
      throw new Error('Expected turn snapshot with burn residual damage.');
    }

    const burnEntry = snapshot.actions.timeline.find(
      (
        entry,
      ): entry is Extract<
        (typeof snapshot.actions.timeline)[number],
        { type: 'status_damage' }
      > =>
        entry.type === 'status_damage' &&
        entry.playerId === playerTwoId &&
        entry.pokemonName === 'Charizard' &&
        entry.status === 'burn',
    );
    expect(burnEntry).toBeDefined();
    expect(burnEntry?.damage).toBeGreaterThan(0);
  });

  it('records misses as non-executed attack outcomes with zero damage timeline entries', async () => {
    const setup = await setupGameLoop();
    const room = getRoom(setup.roomHandle);
    if (!room || !room.game) {
      throw new Error('Expected room game to exist for miss assertions.');
    }
    const player1Id = setup.player1Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error('Expected player ids for miss assertions.');
    }
    const internals = room.game as unknown as {
      partyModule: {
        parties: Map<string, MutableParty>;
      };
    };
    const player1Strength = internals.partyModule.parties
      .get(player1Id)
      ?.getPokemonByName('Charizard')
      ?.moves.find((move) => move.name === 'Strength');
    const player2Strength = internals.partyModule.parties
      .get(player2Id)
      ?.getPokemonByName('Charizard')
      ?.moves.find((move) => move.name === 'Strength');
    if (!player1Strength || !player2Strength) {
      throw new Error('Expected active Strength moves in party state.');
    }
    player1Strength.accuracy = 0;
    player2Strength.accuracy = 0;

    const player1Reasoning = 'Testing miss handling for player 1.';
    const player2Reasoning = 'Testing miss handling for player 2.';
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player1Reasoning,
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player1Session },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player2Reasoning,
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const snapshot = listRoomTurnSnapshots(room, 1)[0];
    if (!snapshot) {
      throw new Error('Expected turn 1 snapshot for miss assertions.');
    }

    expect(snapshot.actions.player1.attackOutcome?.executed).toBe(false);
    expect(snapshot.actions.player1.attackOutcome?.targetPokemon).toBe(
      'Charizard',
    );
    expect(snapshot.actions.player1.attackOutcome?.damage).toBe(0);
    expect(snapshot.actions.player1.attackOutcome?.critical).toBe(false);
    expect(snapshot.actions.player2.attackOutcome?.executed).toBe(false);
    expect(snapshot.actions.player2.attackOutcome?.targetPokemon).toBe(
      'Charizard',
    );
    expect(snapshot.actions.player2.attackOutcome?.damage).toBe(0);
    expect(snapshot.actions.player2.attackOutcome?.critical).toBe(false);

    const attackTimeline = snapshot.actions.timeline.filter(
      (entry) => entry.type === 'attack',
    );
    expect(attackTimeline.length).toBe(2);
    expect(
      attackTimeline.some(
        (entry) =>
          entry.reasoning === player1Reasoning &&
          entry.damage === 0 &&
          entry.critical === false &&
          entry.outcome === 'miss',
      ),
    ).toBe(true);
    expect(
      attackTimeline.some(
        (entry) =>
          entry.reasoning === player2Reasoning &&
          entry.damage === 0 &&
          entry.critical === false &&
          entry.outcome === 'miss',
      ),
    ).toBe(true);
  });

  it('records non-damaging landed attacks as executed', async () => {
    const setup = await setupGameLoop();
    const room = getRoom(setup.roomHandle);
    if (!room || !room.game) {
      throw new Error(
        'Expected room game to exist for non-damaging attack assertions.',
      );
    }
    const player1Id = setup.player1Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error(
        'Expected player ids for non-damaging attack assertions.',
      );
    }
    const internals = room.game as unknown as {
      partyModule: {
        parties: Map<string, MutableParty>;
      };
    };
    const player1Strength = internals.partyModule.parties
      .get(player1Id)
      ?.getPokemonByName('Charizard')
      ?.moves.find((move) => move.name === 'Strength');
    const player2Strength = internals.partyModule.parties
      .get(player2Id)
      ?.getPokemonByName('Charizard')
      ?.moves.find((move) => move.name === 'Strength');
    if (!player1Strength || !player2Strength) {
      throw new Error('Expected active Strength moves in party state.');
    }
    const replacementStatChange: Array<{
      target: 'self' | 'opponent';
      stat:
        | 'accuracy'
        | 'attack'
        | 'critical'
        | 'defense'
        | 'evasion'
        | 'specialAttack'
        | 'specialDefense';
      stages: number;
    }> = [
      {
        target: 'opponent',
        stat: 'defense',
        stages: -1,
      },
    ];
    player1Strength.accuracy = 100;
    player1Strength.power = 0;
    player1Strength.statChanges = replacementStatChange;
    player2Strength.accuracy = 100;
    player2Strength.power = 0;
    player2Strength.statChanges = replacementStatChange.map((change) => ({
      ...change,
    }));

    const player1Reasoning = 'Use a non-damaging, stat-lowering attack.';
    const player2Reasoning = 'Mirror non-damaging pressure.';
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player1Reasoning,
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player1Session },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: player2Reasoning,
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const snapshot = listRoomTurnSnapshots(room, 1)[0];
    if (!snapshot) {
      throw new Error(
        'Expected turn 1 snapshot for non-damaging attack assertions.',
      );
    }

    expect(snapshot.actions.player1.attackOutcome?.executed).toBe(true);
    expect(snapshot.actions.player1.attackOutcome?.damage).toBe(0);
    expect(snapshot.actions.player2.attackOutcome?.executed).toBe(true);
    expect(snapshot.actions.player2.attackOutcome?.damage).toBe(0);

    const attackTimeline = snapshot.actions.timeline.filter(
      (entry) => entry.type === 'attack',
    );
    expect(attackTimeline.length).toBe(2);
    expect(
      attackTimeline.some(
        (entry) =>
          entry.playerId === snapshot.actions.player1.playerId &&
          entry.damage === 0 &&
          entry.outcome === 'hit',
      ),
    ).toBe(true);
    expect(
      attackTimeline.some(
        (entry) =>
          entry.playerId === snapshot.actions.player2.playerId &&
          entry.damage === 0 &&
          entry.outcome === 'hit',
      ),
    ).toBe(true);
  });

  it('keeps reasoning for non-executed attacks and inter-turn replacement switches', async () => {
    const setup = await setupGameLoop();
    const player1Id = setup.player1Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(
      setup.roomHandle,
    )?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error('Expected joined player ids in session state.');
    }

    let faintedEntry: { playerId: string } | undefined;
    let turnWithFaint = 0;

    for (let turn = 1; turn <= 8; turn += 1) {
      const turnReasonP1 = `Turn ${turn} pressure line from player 1.`;
      const turnReasonP2 = `Turn ${turn} pressure line from player 2.`;

      await playMoveController.handle(
        {
          room_handle: setup.roomHandle,
          action: {
            type: 'attack',
            reasoning: turnReasonP1,
            payload: {
              attackName: 'Strength',
            },
          },
        },
        { sessionState: setup.player1Session },
      );
      await playMoveController.handle(
        {
          room_handle: setup.roomHandle,
          action: {
            type: 'attack',
            reasoning: turnReasonP2,
            payload: {
              attackName: 'Strength',
            },
          },
        },
        { sessionState: setup.player2Session },
      );

      const roomAfterTurn = getRoom(setup.roomHandle);
      if (!roomAfterTurn) {
        throw new Error(`Expected room after turn ${turn}.`);
      }
      const turnSnapshot = listRoomTurnSnapshots(roomAfterTurn, turn)[0];
      if (!turnSnapshot) {
        throw new Error(`Expected turn ${turn} snapshot.`);
      }

      const attackTimeline = turnSnapshot.actions.timeline.filter(
        (entry) => entry.type === 'attack',
      );
      expect(
        attackTimeline.some((entry) => entry.reasoning === turnReasonP1),
      ).toBe(true);
      expect(
        attackTimeline.some((entry) => entry.reasoning === turnReasonP2),
      ).toBe(true);

      const fainted = turnSnapshot.actions.fainted[0];
      if (fainted) {
        faintedEntry = fainted;
        turnWithFaint = turn;
        break;
      }
    }

    if (!faintedEntry) {
      throw new Error(
        'Expected one fainted Pokemon after repeated guaranteed-hit turns.',
      );
    }
    const faintedSession =
      faintedEntry.playerId === player1Id
        ? setup.player1Session
        : setup.player2Session;
    const otherSession =
      faintedEntry.playerId === player1Id
        ? setup.player2Session
        : setup.player1Session;

    const replacementReason =
      'Forced replacement: Raichu is preferred over Nidoking for immediate speed control; if only one legal replacement existed, this would state that explicitly.';
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'switch',
          reasoning: replacementReason,
          payload: {
            newPokemon: 'Raichu',
          },
        },
      },
      { sessionState: faintedSession },
    );

    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning:
            'Replacement side now attacks to progress turn resolution.',
          payload: {
            attackName: 'Surf',
          },
        },
      },
      { sessionState: faintedSession },
    );
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: 'Opponent responds to complete the turn.',
          payload: {
            attackName: 'Strength',
          },
        },
      },
      { sessionState: otherSession },
    );

    const roomAfterReplacementTurn = getRoom(setup.roomHandle);
    if (!roomAfterReplacementTurn) {
      throw new Error('Expected room after replacement turn.');
    }
    const turnAfterReplacementSnapshot = listRoomTurnSnapshots(
      roomAfterReplacementTurn,
      turnWithFaint + 1,
    )[0];
    if (!turnAfterReplacementSnapshot) {
      throw new Error('Expected replacement turn snapshot.');
    }

    const replacementSwitchInTimeline =
      turnAfterReplacementSnapshot.actions.timeline.find(
        (entry) =>
          entry.type === 'switch' &&
          entry.playerId === faintedEntry.playerId &&
          entry.reasoning === replacementReason,
      );
    expect(replacementSwitchInTimeline).toBeDefined();
  });
});
