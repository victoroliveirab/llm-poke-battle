import { asRequiredString } from "../parse";
import { errorResult, jsonResult } from "../response";
import { getRoom } from "../rooms";
import type { ToolController } from "../toolController";

export const selectPartyController: ToolController = {
  name: "select_party",
  description:
    "Submit your 3-Pokemon party during PARTY_SELECTION. Once both parties are set, phase moves to GAME_LOOP.",
  inputSchema: {
    type: "object",
    properties: {
      room_handle: { type: "string" },
      p1: {
        type: "string",
        description: "First Pokemon name, e.g. \"Charizard\"."
      },
      p2: {
        type: "string",
        description: "Second Pokemon name."
      },
      p3: {
        type: "string",
        description: "Third Pokemon name."
      }
    },
    required: ["room_handle", "p1", "p2", "p3"]
  },
  handle: (args, { sessionState }) => {
    const roomHandle = asRequiredString(args.room_handle, "room_handle");
    const room = getRoom(roomHandle);

    if (!room) {
      return errorResult(`Room '${roomHandle}' not found.`);
    }

    if (!room.gameStarted) {
      return errorResult("Game has not started yet. The room creator must call start_game first.");
    }

    const membership = sessionState.joinedRooms.get(room.roomId);
    if (!membership || !room.players.has(membership.playerId)) {
      return errorResult("You must join this room before selecting a party.");
    }

    if (!room.game) {
      return errorResult("Game not started yet.");
    }

    const party = [
      asRequiredString(args.p1, "p1"),
      asRequiredString(args.p2, "p2"),
      asRequiredString(args.p3, "p3")
    ];

    room.game.selectParty(membership.playerId, party);
    return jsonResult({
      selected_by: membership.publicName,
      state: room.game.getStateAsPlayer(membership.playerId)
    });
  }
};
