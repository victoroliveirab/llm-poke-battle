import { asRequiredString } from '../parse';
import { errorResult, jsonResult } from '../response';
import { getRoom } from '../rooms';
import type { ToolController } from '../toolController';

// export const listMovesController: ToolController = {
//   name: "list_moves",
//   description: "List your current available moves and opponent moves revealed so far.",
//   inputSchema: {
//     type: "object",
//     properties: {
//       room_handle: { type: "string" }
//     },
//     required: ["room_handle"]
//   },
//   handle: (args, { sessionState }) => {
//     const roomHandle = asRequiredString(args.room_handle, "room_handle");
//     const room = getRoom(roomHandle);
//
//     if (!room) {
//       return errorResult(`Room '${roomHandle}' not found.`);
//     }
//
//     const membership = sessionState.joinedRooms.get(room.roomId);
//     if (!membership || !room.players.has(membership.playerId)) {
//       return errorResult("You must join this room before listing moves.");
//     }
//
//     return jsonResult({
//       your_moves: room.engine.listPlayerMoves(playerSlot),
//       revealed_opponent_moves: room.engine.listRevealedOpponentMoves(playerSlot)
//     });
//   }
// };
