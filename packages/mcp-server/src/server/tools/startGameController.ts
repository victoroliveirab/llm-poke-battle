import { asRequiredString } from "../parse";
import { errorResult, jsonResult } from "../response";
import {
  MAX_PLAYERS_PER_ROOM,
  getRoom,
  isRoomFull,
  listRoomPlayers,
  markRoomGameStarted,
  resetRoomGame,
} from "../rooms";
import type { ToolController } from "../toolController";

export const startGameController: ToolController = {
  name: "start_game",
  description:
    "Creator-only: start/reset the game in PARTY_SELECTION once the room is full.",
  inputSchema: {
    type: "object",
    properties: {
      room_handle: { type: "string" }
    },
    required: ["room_handle"]
  },
  handle: (args, { sessionState }) => {
    const roomHandle = asRequiredString(args.room_handle, "room_handle");
    const room = getRoom(roomHandle);

    if (!room) {
      return errorResult(`Room '${roomHandle}' not found.`);
    }

    const membership = sessionState.joinedRooms.get(room.roomId);
    if (!membership || !room.players.has(membership.playerId)) {
      return errorResult("You must join this room before starting a game.");
    }

    if (room.creatorPlayerId !== membership.playerId) {
      return errorResult("Only the room creator can start the game.");
    }

    if (!isRoomFull(room)) {
      return errorResult(`Room is not full. A room must have exactly ${MAX_PLAYERS_PER_ROOM} players.`);
    }

    const roomPlayers = listRoomPlayers(room);
    if (roomPlayers.length !== MAX_PLAYERS_PER_ROOM) {
      return errorResult(`Room is not full. A room must have exactly ${MAX_PLAYERS_PER_ROOM} players.`);
    }

    markRoomGameStarted(room);
    const game = resetRoomGame(room);
    return jsonResult(game.getStateAsPlayer(membership.playerId));
  }
};
