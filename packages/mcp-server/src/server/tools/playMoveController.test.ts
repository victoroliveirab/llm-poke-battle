import { describe, expect, it } from 'bun:test';
import { createSessionState, type SessionState } from '../sessionState';
import { getRoom, listRoomTurnSnapshots } from '../rooms';
import { selectPartyController } from './selectPartyController';
import { joinRoomController } from './joinRoomController';
import { playMoveController } from './playMoveController';
import { startGameController } from './startGameController';

type SessionSetup = {
  roomHandle: string;
  player1Session: SessionState;
  player2Session: SessionState;
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
  };
  await selectPartyController.handle(partyArgs, { sessionState: player1Session });
  await selectPartyController.handle(partyArgs, { sessionState: player2Session });

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
    expect(attackTimeline.length).toBe(2);
    expect(attackTimeline.some((entry) => entry.reasoning === player1Reasoning)).toBe(
      true,
    );
    expect(attackTimeline.some((entry) => entry.reasoning === player2Reasoning)).toBe(
      true,
    );
  });

  it('keeps reasoning for non-executed attacks and inter-turn replacement switches', async () => {
    const setup = await setupGameLoop();
    const player1Id = setup.player1Session.joinedRooms.get(setup.roomHandle)?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(setup.roomHandle)?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error('Expected joined player ids in session state.');
    }

    const turn1ReasonP1 = 'Turn 1 pressure line from player 1.';
    const turn1ReasonP2 = 'Turn 1 pressure line from player 2.';
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: turn1ReasonP1,
          payload: {
            attackName: 'Rock Slide',
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
          reasoning: turn1ReasonP2,
          payload: {
            attackName: 'Rock Slide',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const turn2ReasonP1 = 'Turn 2 all-in to force a knockout.';
    const turn2ReasonP2 = 'Turn 2 all-in to force a knockout.';
    await playMoveController.handle(
      {
        room_handle: setup.roomHandle,
        action: {
          type: 'attack',
          reasoning: turn2ReasonP1,
          payload: {
            attackName: 'Rock Slide',
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
          reasoning: turn2ReasonP2,
          payload: {
            attackName: 'Rock Slide',
          },
        },
      },
      { sessionState: setup.player2Session },
    );

    const roomAfterTurn2 = getRoom(setup.roomHandle);
    if (!roomAfterTurn2) {
      throw new Error('Expected room after turn 2.');
    }
    const turn2Snapshot = listRoomTurnSnapshots(roomAfterTurn2, 2)[0];
    if (!turn2Snapshot) {
      throw new Error('Expected turn 2 snapshot.');
    }

    const turn2AttackTimeline = turn2Snapshot.actions.timeline.filter(
      (entry) => entry.type === 'attack',
    );
    expect(turn2AttackTimeline.some((entry) => entry.reasoning === turn2ReasonP1)).toBe(
      true,
    );
    expect(turn2AttackTimeline.some((entry) => entry.reasoning === turn2ReasonP2)).toBe(
      true,
    );

    const faintedEntry = turn2Snapshot.actions.fainted[0];
    if (!faintedEntry) {
      throw new Error('Expected one fainted Pokemon after turn 2.');
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
          reasoning: 'Replacement side now attacks to progress turn resolution.',
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
            attackName: 'Rock Slide',
          },
        },
      },
      { sessionState: otherSession },
    );

    const roomAfterTurn3 = getRoom(setup.roomHandle);
    if (!roomAfterTurn3) {
      throw new Error('Expected room after turn 3.');
    }
    const turn3Snapshot = listRoomTurnSnapshots(roomAfterTurn3, 3)[0];
    if (!turn3Snapshot) {
      throw new Error('Expected turn 3 snapshot.');
    }

    const replacementSwitchInTimeline = turn3Snapshot.actions.timeline.find(
      (entry) =>
        entry.type === 'switch' &&
        entry.playerId === faintedEntry.playerId &&
        entry.reasoning === replacementReason,
    );
    expect(replacementSwitchInTimeline).toBeDefined();
  });
});
