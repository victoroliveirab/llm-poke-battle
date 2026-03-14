import {
  MAX_PLAYERS_PER_ROOM,
  listRoomPlayers,
  type Room,
  type RoomMembership,
  type SnapshotPhase,
} from './rooms';

type NextActionType =
  | 'start_game'
  | 'wait_for_creator_start'
  | 'select_party'
  | 'wait_for_opponent_party'
  | 'play_move'
  | 'stop';

type JoinRoomToolSequenceStep = {
  order: number;
  tool:
    | 'join_room'
    | 'start_game'
    | 'select_party'
    | 'get_game_state'
    | 'play_move';
  condition: string;
  objective: string;
};

type NextActionToolName =
  | 'join_room'
  | 'start_game'
  | 'select_party'
  | 'get_game_state'
  | 'play_move';

type NextActionInstruction = {
  type: NextActionType;
  instruction: string;
  human_input_required: false;
  tool_call: {
    tool: NextActionToolName;
    arguments: Record<string, unknown>;
    poll_interval_ms: number | null;
  } | null;
};

export type JoinRoomHarnessGuidance = {
  objective: string;
  phases: SnapshotPhase[];
  autonomy: {
    human_input_required: false;
    ask_human_for_help: false;
    mode: 'fully_autonomous_after_join';
  };
  communication_policy: {
    user_questions_allowed: false;
    confirmation_requests_allowed: false;
    option_offers_allowed: false;
    required_behavior: 'execute_next_action_without_user_confirmation';
    prohibited_phrases: string[];
  };
  response_policy: {
    silent_while_running: true;
    final_report_events: Array<'game_over' | 'terminal_error'>;
  };
  role: {
    is_creator: boolean;
    player_slot: 1 | 2 | null;
    public_name: string;
  };
  current_status: {
    room_is_full: boolean;
    players_joined: number;
    game_started: boolean;
    phase: SnapshotPhase;
    your_party_selected: boolean;
  };
  next_action: NextActionInstruction;
  autonomous_loop: string[];
  lifecycle: {
    after_join: string[];
    party_selection: string[];
    game_loop: string[];
    termination: string[];
  };
  phase_paths_by_tool: {
    start_game: 'phase';
    get_game_state: 'phase';
    select_party: 'state.phase';
    play_move: 'state.phase';
  };
  tool_sequence: JoinRoomToolSequenceStep[];
  error_handling: {
    retriable_patterns: string[];
    terminal_patterns: string[];
    retry_policy: {
      interval_ms: number;
      max_attempts: null;
      notes: string;
    };
  };
  stop_condition: {
    phase_equals: 'game_over';
    require_final_state_fetch: true;
  };
};

export type JoinRoomHarnessPayload = {
  harness_guidance_version: 'v1';
  harness_guidance: JoinRoomHarnessGuidance;
  harness_prompt: string;
};

export function buildJoinRoomHarnessPayload(params: {
  room: Room;
  membership: RoomMembership;
}): JoinRoomHarnessPayload {
  const { room, membership } = params;
  const roomPlayers = listRoomPlayers(room);
  const playerSlot =
    roomPlayers.find((player) => player.playerId === membership.playerId)
      ?.slot ?? null;
  const isCreator = room.creatorPlayerId === membership.playerId;
  const roomIsFull = room.players.size === MAX_PLAYERS_PER_ROOM;
  const phase = room.game ? room.game.getPhase() : 'party_selection';
  const safePlayerState = room.game
    ? room.game.getStateAsPlayer(membership.playerId)
    : null;
  const yourPartySelected =
    safePlayerState !== null && safePlayerState.player !== null;
  const requiredPartySize = safePlayerState?.requiredPartySize ?? 3;
  const nextAction = inferNextAction({
    roomHandle: room.roomId,
    isCreator,
    roomIsFull,
    gameStarted: room.gameStarted,
    phase,
    yourPartySelected,
    requiredPartySize,
  });

  const guidance: JoinRoomHarnessGuidance = {
    objective:
      'Win the battle by reaching game_over with your opponent defeated.',
    phases: ['party_selection', 'game_loop', 'game_over'],
    autonomy: {
      human_input_required: false,
      ask_human_for_help: false,
      mode: 'fully_autonomous_after_join',
    },
    communication_policy: {
      user_questions_allowed: false,
      confirmation_requests_allowed: false,
      option_offers_allowed: false,
      required_behavior: 'execute_next_action_without_user_confirmation',
      prohibited_phrases: [
        'If you want, I can',
        'Do you want me to',
        'Share this room handle',
      ],
    },
    response_policy: {
      silent_while_running: true,
      final_report_events: ['game_over', 'terminal_error'],
    },
    role: {
      is_creator: isCreator,
      player_slot: playerSlot,
      public_name: membership.publicName,
    },
    current_status: {
      room_is_full: roomIsFull,
      players_joined: room.players.size,
      game_started: room.gameStarted,
      phase,
      your_party_selected: yourPartySelected,
    },
    next_action: nextAction,
    autonomous_loop: buildAutonomousLoop({
      roomHandle: room.roomId,
      isCreator,
    }),
    lifecycle: {
      after_join: [
        'Do not wait for human input after join_room.',
        'Do not ask a human what to do next. Follow this guidance autonomously.',
        'Call join_room only once at bootstrap.',
        'If you created the room, poll start_game every 1000ms until it succeeds.',
        'If you joined an existing room, poll get_game_state every 1000ms until you should pick a party.',
        isCreator
          ? 'Creator path: keep retrying start_game until it returns game state.'
          : 'Non-creator path: never call start_game before game starts.',
      ],
      party_selection: [
        'When phase is party_selection and your_party_selected is false, call select_party once with p1, p2, p3 plus p1_reason, p2_reason, p3_reason, and lead_reason.',
        'Choose party members from availablePokemon in state.',
        'The first pick (p1) is your lead. lead_reason must explicitly explain why this opener is strongest for your plan.',
        'If your party is already selected, keep polling get_game_state until phase becomes game_loop.',
      ],
      game_loop: [
        'When phase is game_loop, call play_move with one action per turn (attack or switch).',
        'Every play_move action must include action.reasoning with a concise explanation of why the move was chosen.',
        'For forced replacement switches, if multiple bench choices are available, explain why the selected Pokemon is better than alternatives.',
        "For forced replacement switches with only one legal choice, set reasoning to explain that it is the only available option.",
        'If your action is queued and no turn resolution occurs yet, wait and call get_game_state before retrying.',
        'Use current visible state to decide your next action. No human input is needed.',
      ],
      termination: [
        'Stop only when phase equals game_over.',
        'Before stopping, fetch final state using get_game_state if your last response did not include phase game_over.',
        'Record winner and final turn, then exit the harness loop.',
      ],
    },
    phase_paths_by_tool: {
      start_game: 'phase',
      get_game_state: 'phase',
      select_party: 'state.phase',
      play_move: 'state.phase',
    },
    tool_sequence: buildToolSequence(isCreator),
    error_handling: {
      retriable_patterns: [
        'Room is not full. A room must have exactly 2 players.',
        'Game has not started yet. The room creator must call start_game first.',
        'Game not started yet.',
        'Only the room creator can start the game.',
        'Waiting for replacement switch before the next turn can start.',
      ],
      terminal_patterns: ["Room '", 'You must join this room before'],
      retry_policy: {
        interval_ms: 1000,
        max_attempts: null,
        notes:
          'Retry retriable errors indefinitely with backoff jitter if desired. Stop immediately on terminal errors.',
      },
    },
    stop_condition: {
      phase_equals: 'game_over',
      require_final_state_fetch: true,
    },
  };

  return {
    harness_guidance_version: 'v1',
    harness_guidance: guidance,
    harness_prompt: buildHarnessPrompt({
      roomHandle: room.roomId,
      rolePublicName: membership.publicName,
      playerSlot,
      isCreator,
      nextAction: nextAction.instruction,
      loopSteps: guidance.autonomous_loop,
    }),
  };
}

function inferNextAction(params: {
  roomHandle: string;
  isCreator: boolean;
  roomIsFull: boolean;
  gameStarted: boolean;
  phase: SnapshotPhase;
  yourPartySelected: boolean;
  requiredPartySize: number;
}): NextActionInstruction {
  const {
    roomHandle,
    isCreator,
    roomIsFull,
    gameStarted,
    phase,
    yourPartySelected,
    requiredPartySize,
  } = params;

  if (!gameStarted) {
    if (isCreator) {
      return {
        type: 'start_game',
        instruction:
          roomIsFull
            ? 'You are creator and room is full. Keep calling start_game until it succeeds and returns game state.'
            : 'You are creator. Poll start_game until it succeeds (it will fail with room-not-full until player 2 joins).',
        human_input_required: false,
        tool_call: {
          tool: 'start_game',
          arguments: { room_handle: roomHandle },
          poll_interval_ms: 1000,
        },
      };
    }

    return {
      type: 'wait_for_creator_start',
      instruction:
        'Do not call join_room again. Poll get_game_state until the game starts and you can select your party.',
      human_input_required: false,
      tool_call: {
        tool: 'get_game_state',
        arguments: { room_handle: roomHandle },
        poll_interval_ms: 1000,
      },
    };
  }

  if (phase === 'game_over') {
    return {
      type: 'stop',
      instruction:
        'Game is already over. Fetch final state if needed, record winner, and stop.',
      human_input_required: false,
      tool_call: null,
    };
  }

  if (phase === 'party_selection') {
    if (!yourPartySelected) {
      const partyArgs: Record<string, unknown> = {
        room_handle: roomHandle,
      };
      for (let slot = 1; slot <= requiredPartySize; slot += 1) {
        partyArgs[`p${slot}`] = `<PokemonName${slot}>`;
        partyArgs[`p${slot}_reason`] = `<ReasoningForPick${slot}>`;
      }
      partyArgs.lead_reason = '<LeadReasoningForP1>';

      return {
        type: 'select_party',
        instruction:
          'Call select_party once now with p1, p2, p3 chosen from availablePokemon plus p1_reason, p2_reason, p3_reason, and lead_reason.',
        human_input_required: false,
        tool_call: {
          tool: 'select_party',
          arguments: partyArgs,
          poll_interval_ms: null,
        },
      };
    }

    return {
      type: 'wait_for_opponent_party',
      instruction:
        'Your party is locked. Poll get_game_state until phase changes to game_loop.',
      human_input_required: false,
      tool_call: {
        tool: 'get_game_state',
        arguments: { room_handle: roomHandle },
        poll_interval_ms: 1000,
      },
    };
  }

  return {
    type: 'play_move',
    instruction:
      'Call play_move with attack or switch each turn until phase reaches game_over.',
    human_input_required: false,
    tool_call: {
      tool: 'play_move',
      arguments: {
        room_handle: roomHandle,
        action: {
          type: 'attack',
          reasoning: '<Reasoning>',
          payload: {
            attackName: '<AttackName>',
          },
        },
      },
      poll_interval_ms: null,
    },
  };
}

function buildToolSequence(isCreator: boolean): JoinRoomToolSequenceStep[] {
  return [
    {
      order: 1,
      tool: 'join_room',
      condition:
        'Call exactly once to create/join room and bootstrap lifecycle guidance.',
      objective: 'Initialize role and autonomous loop state.',
    },
    {
      order: 2,
      tool: isCreator ? 'start_game' : 'get_game_state',
      condition: isCreator
        ? 'Poll start_game every 1000ms until it succeeds.'
        : 'Poll get_game_state every 1000ms until game starts.',
      objective: isCreator
        ? 'Start match as soon as room becomes full.'
        : 'Wait for creator to start match without re-calling join_room.',
    },
    {
      order: 3,
      tool: 'select_party',
      condition:
        'Call once when phase is party_selection and your_party_selected is false.',
      objective:
        'Lock your three Pokemon and wait for both parties to be ready.',
    },
    {
      order: 4,
      tool: 'play_move',
      condition: 'Call repeatedly when phase is game_loop.',
      objective: 'Advance turns until a winner is decided.',
    },
    {
      order: 5,
      tool: 'get_game_state',
      condition:
        'Call after game start while waiting for phase transitions, turn resolution, or final confirmation.',
      objective:
        'Poll lifecycle progress and enforce stop condition at game_over.',
    },
  ];
}

function buildHarnessPrompt(params: {
  roomHandle: string;
  rolePublicName: string;
  playerSlot: 1 | 2 | null;
  isCreator: boolean;
  nextAction: string;
  loopSteps: string[];
}): string {
  const {
    roomHandle,
    rolePublicName,
    playerSlot,
    isCreator,
    nextAction,
    loopSteps,
  } = params;
  const slotText = playerSlot === null ? 'unknown' : String(playerSlot);

  return [
    'Use the poke-battle MCP server.',
    'You are an autonomous battle harness.',
    'Autonomous battle harness instructions:',
    'Strict communication policy: do not ask questions, do not request confirmation, and do not offer options.',
    "Do not output phrases like 'If you want, I can...' or 'Do you want me to...'.",
    'Call join_room exactly once.',
    'If you created the room, start polling start_game until the match starts.',
    'If you joined an existing room, start polling get_game_state until you should pick a party.',
    `- Room handle: ${roomHandle}`,
    `- You are ${rolePublicName} (slot ${slotText}).`,
    `- Creator role: ${isCreator ? 'yes' : 'no'}.`,
    '- No human input is required after this join_room response.',
    '- Never ask a human for next steps. Keep polling and acting per this contract.',
    '- Lifecycle: start_game (creator only) -> select_party -> play_move loop -> stop at game_over.',
    '- For select_party, include p1_reason, p2_reason, p3_reason, and lead_reason. p1 is your lead and lead_reason must explain the opening plan in detail.',
    '- For every play_move call, include action.reasoning (free text) explaining the decision.',
    '- Forced switch rule: if multiple legal replacements exist, explain why the selected one is best; if only one exists, say it is the only legal choice.',
    '- Before game start: creator polls start_game, non-creator polls get_game_state.',
    '- Stop only when phase equals game_over, then record winner and exit.',
    '- Do not send status updates while running. Send one final report on game_over or terminal_error.',
    `- Immediate next action: ${nextAction}`,
    '',
    'Autonomous loop:',
    ...loopSteps,
  ].join('\n');
}

function buildAutonomousLoop(params: {
  roomHandle: string;
  isCreator: boolean;
}): string[] {
  const { roomHandle, isCreator } = params;

  return [
    `- call join_room({"room_handle":"${roomHandle}"})`,
    isCreator
      ? `- poll start_game({"room_handle":"${roomHandle}"}) every 1000ms until it succeeds`
      : `- poll get_game_state({"room_handle":"${roomHandle}"}) every 1000ms until phase is party_selection and your party is not selected`,
    `- once game_started=true, call get_game_state({"room_handle":"${roomHandle}"})`,
    `- if state.phase=="party_selection" and your_party_selected=false, call select_party({"room_handle":"${roomHandle}","p1":"<PokemonName1>","p2":"<PokemonName2>","p3":"<PokemonName3>","p1_reason":"<ReasoningForPick1>","p2_reason":"<ReasoningForPick2>","p3_reason":"<ReasoningForPick3>","lead_reason":"<LeadReasoningForP1>"})`,
    `- if state.phase=="party_selection" and your_party_selected=true, continue polling get_game_state({"room_handle":"${roomHandle}"})`,
    `- if state.phase=="game_loop", choose attack or switch and call play_move({"room_handle":"${roomHandle}","action":{"type":"attack","reasoning":"<Reasoning>","payload":{"attackName":"<AttackName>"}}})`,
    `- if play_move returns error "Action already taken", poll get_game_state({"room_handle":"${roomHandle}"}) and continue`,
    `- if state.phase=="game_over", record winner and stop`,
    '- Do not ask for user input during the loop.',
  ];
}
