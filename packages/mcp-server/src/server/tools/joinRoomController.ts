import { asOptionalString } from "../parse";
import { errorResult, jsonResult } from "../response";
import {
  MAX_PLAYERS_PER_ROOM,
  addPlayerToRoom,
  createRoom,
  getRoom,
  isRoomFull,
  listPlayersInRoom
} from "../rooms";
import type { ToolController } from "../toolController";

export const joinRoomController: ToolController = {
  name: "join_room",
  description:
    "Create a room and join it when no parameter is provided, or join an existing room by handle. Idempotent per MCP session and room.",
  inputSchema: {
    type: "object",
    properties: {
      room_handle: {
        type: "string",
        description: "Room UUID returned by join_room. Optional."
      }
    }
  },
  handle: (args, { sessionState }) => {
    const roomHandle = asOptionalString(args.room_handle);
    const room = roomHandle ? getRoom(roomHandle) : createRoom();
    const createdRoom = !roomHandle;

    if (!room) {
      return errorResult(`Room '${roomHandle}' not found.`);
    }

    const existingMembership = sessionState.joinedRooms.get(room.roomId);
    if (existingMembership && room.players.has(existingMembership.playerId)) {
      return jsonResult({
        created_room: createdRoom,
        room_handle: room.roomId,
        player_id: existingMembership.playerId,
        public_name: existingMembership.publicName,
        players_in_room: listPlayersInRoom(room),
        joined_existing: true
      });
    }

    if (isRoomFull(room)) {
      return errorResult(`Room '${room.roomId}' is full (max ${MAX_PLAYERS_PER_ROOM} players).`);
    }

    const { playerId, publicName } = addPlayerToRoom(room);
    sessionState.joinedRooms.set(room.roomId, { playerId, publicName });

    return jsonResult({
      created_room: createdRoom,
      room_handle: room.roomId,
      player_id: playerId,
      public_name: publicName,
      players_in_room: listPlayersInRoom(room),
      joined_existing: false
    });
  }
};
