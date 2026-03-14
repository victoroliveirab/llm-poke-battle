import { asRequiredString } from '../parse';
import { errorResult, jsonResult } from '../response';
import { getRoom } from '../rooms';
import type { ToolController } from '../toolController';

export const getGameStateController: ToolController = {
  name: 'get_game_state',
  description: 'Get the current game state for a room.',
  inputSchema: {
    type: 'object',
    properties: {
      room_handle: { type: 'string' },
    },
    required: ['room_handle'],
  },
  handle: (args, { sessionState }) => {
    const roomHandle = asRequiredString(args.room_handle, 'room_handle');
    const room = getRoom(roomHandle);

    if (!room) {
      return errorResult(`Room '${roomHandle}' not found.`);
    }

    const membership = sessionState.joinedRooms.get(room.roomId);
    if (!membership || !room.players.has(membership.playerId)) {
      return errorResult(
        'You must join this room before requesting game state.',
      );
    }

    if (!room.game) {
      return errorResult('Game not started yet.');
    }

    return jsonResult(room.game.getStateAsPlayer(membership.playerId));
  },
};
