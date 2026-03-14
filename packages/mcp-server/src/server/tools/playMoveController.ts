import { InvalidMoveError } from '@poke-battle/battle-engine';
import { asRecord, asRequiredString } from '../parse';
import { errorResult, jsonResult } from '../response';
import {
  captureRoomTurnSnapshot,
  clearPendingTurnActions,
  getRoom,
  hasTurnSnapshot,
  listRoomPlayers,
  setPendingTurnAction,
  snapshotPendingTurnActions,
  type Room,
  type SubmittedTurnAction,
} from '../rooms';
import type { ToolController } from '../toolController';

export const playMoveController: ToolController = {
  name: 'play_move',
  description:
    'Submit one action in GAME_LOOP and return updated state; repeat until phase is game_over.',
  inputSchema: {
    type: 'object',
    properties: {
      room_handle: { type: 'string' },
      action: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          payload: {},
        },
        required: ['type', 'payload'],
      },
    },
    required: ['room_handle', 'action'],
  },
  handle: (args, { sessionState }) => {
    const roomHandle = asRequiredString(args.room_handle, 'room_handle');
    const actionInput = asRecord(args.action);
    const room = getRoom(roomHandle);

    if (!room) {
      return errorResult(`Room '${roomHandle}' not found.`);
    }

    const membership = sessionState.joinedRooms.get(room.roomId);
    if (!membership || !room.players.has(membership.playerId)) {
      return errorResult('You must join this room before playing moves.');
    }

    if (!room.game) {
      return errorResult('Game not started yet.');
    }

    try {
      const stateBefore = room.game.getStateAsPlayer(membership.playerId);
      const preTurnActivePokemonByPlayerId =
        capturePreTurnActivePokemonByPlayerId(room);
      const submittedAction = parseSubmittedTurnAction(actionInput);
      const action = {
        playerID: membership.playerId,
        type: submittedAction.type,
        payload:
          submittedAction.type === 'attack'
            ? {
                attackName: submittedAction.attackName,
              }
            : {
                newPokemon: submittedAction.newPokemon,
              },
      };
      const emittedEvents = room.game.selectAction(action);
      const actionQueuedForTurn = emittedEvents.some(
        (event) =>
          event.type === 'action.submitted' &&
          event.playerId === membership.playerId,
      );
      if (actionQueuedForTurn) {
        setPendingTurnAction(room, membership.playerId, submittedAction);
      }

      const stateAfter = room.game.getStateAsPlayer(membership.playerId);
      const resolvedTurn = inferResolvedTurn(stateBefore, stateAfter);
      if (resolvedTurn !== null) {
        const submittedActionsByPlayerId = snapshotPendingTurnActions(room);

        try {
          if (!hasTurnSnapshot(room, resolvedTurn)) {
            captureRoomTurnSnapshot(room, resolvedTurn, {
              emittedEvents,
              preTurnActivePokemonByPlayerId,
              submittedActionsByPlayerId,
            });
          }
        } finally {
          clearPendingTurnActions(room);
        }
      }

      return jsonResult({
        state: stateAfter,
      });
    } catch (error) {
      if (error instanceof InvalidMoveError) {
        return jsonResult({
          error: error.message,
          state: room.game.getStateAsPlayer(membership.playerId),
        });
      }
      throw error;
    }
  },
};

type TurnPhaseState = {
  phase: 'party_selection' | 'game_loop' | 'game_over';
  turn: number;
};

type PartyEntrySnapshot = {
  name: string;
};

function parseSubmittedTurnAction(
  actionInput: Record<string, unknown>,
): SubmittedTurnAction {
  const actionType = asRequiredString(actionInput.type, 'action.type');
  const payload = asRecord(actionInput.payload);

  if (actionType === 'attack') {
    return {
      type: 'attack',
      attackName: asRequiredString(
        payload.attackName,
        'action.payload.attackName',
      ),
    };
  }

  if (actionType === 'switch') {
    return {
      type: 'switch',
      newPokemon: asRequiredString(
        payload.newPokemon,
        'action.payload.newPokemon',
      ),
    };
  }

  throw new Error(`Unknown action type '${actionType}'.`);
}

function capturePreTurnActivePokemonByPlayerId(room: Room): Map<string, string> {
  const activePokemonByPlayerId = new Map<string, string>();
  if (!room.game) {
    return activePokemonByPlayerId;
  }

  for (const player of listRoomPlayers(room)) {
    const party = room.game.getParty(
      player.playerId,
      player.playerId,
    ) as PartyEntrySnapshot[];
    const activePokemon = party[0];
    if (!activePokemon) {
      continue;
    }

    activePokemonByPlayerId.set(player.playerId, activePokemon.name);
  }

  return activePokemonByPlayerId;
}

function inferResolvedTurn(
  before: TurnPhaseState,
  after: TurnPhaseState,
): number | null {
  if (after.turn > before.turn) {
    return after.turn - 1;
  }

  if (before.phase === 'game_loop' && after.phase === 'game_over') {
    return after.turn;
  }

  return null;
}
