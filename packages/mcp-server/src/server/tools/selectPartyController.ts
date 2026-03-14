import { asRequiredString } from "../parse";
import { errorResult, jsonResult } from "../response";
import { getRoom, setPartySelectionReasoning } from "../rooms";
import type { ToolController } from "../toolController";

export const selectPartyController: ToolController = {
  name: "select_party",
  description:
    "Submit your 3-Pokemon party plus reasoning per pick during PARTY_SELECTION. Once both parties are set, phase moves to GAME_LOOP.",
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
      },
      p1_reason: {
        type: "string",
        description: "Reasoning for first pick."
      },
      p2_reason: {
        type: "string",
        description: "Reasoning for second pick."
      },
      p3_reason: {
        type: "string",
        description: "Reasoning for third pick."
      },
      lead_reason: {
        type: "string",
        description:
          "Extra explanation for why the first pick is the lead."
      }
    },
    required: [
      "room_handle",
      "p1",
      "p2",
      "p3",
      "p1_reason",
      "p2_reason",
      "p3_reason",
      "lead_reason"
    ]
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
    const partyReasoning = {
      p1Reason: asRequiredString(args.p1_reason, "p1_reason"),
      p2Reason: asRequiredString(args.p2_reason, "p2_reason"),
      p3Reason: asRequiredString(args.p3_reason, "p3_reason"),
      leadReason: asRequiredString(args.lead_reason, "lead_reason")
    };

    room.game.selectParty(membership.playerId, party);
    setPartySelectionReasoning(room, membership.playerId, {
      p1: party[0] ?? "",
      p2: party[1] ?? "",
      p3: party[2] ?? "",
      p1Reason: partyReasoning.p1Reason,
      p2Reason: partyReasoning.p2Reason,
      p3Reason: partyReasoning.p3Reason,
      leadReason: partyReasoning.leadReason
    });

    return jsonResult({
      selected_by: membership.publicName,
      party_reasoning: {
        p1_reason: partyReasoning.p1Reason,
        p2_reason: partyReasoning.p2Reason,
        p3_reason: partyReasoning.p3Reason,
        lead_reason: partyReasoning.leadReason
      },
      state: room.game.getStateAsPlayer(membership.playerId)
    });
  }
};
