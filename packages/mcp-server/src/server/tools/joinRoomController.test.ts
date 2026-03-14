import { describe, expect, it } from 'bun:test';
import type { ToolResponse } from '../response';
import { createSessionState } from '../sessionState';
import { joinRoomController } from './joinRoomController';
import { startGameController } from './startGameController';

function parseJsonPayload(response: ToolResponse): Record<string, unknown> {
  if (response.isError) {
    throw new Error(
      `Expected success response but received error: ${response.content[0]?.text}`,
    );
  }

  const textPayload = response.content[0]?.text;
  if (!textPayload) {
    throw new Error('Expected text payload in tool response.');
  }

  const parsed = JSON.parse(textPayload);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Expected JSON object payload.');
  }

  return parsed as Record<string, unknown>;
}

describe('join_room json contract', () => {
  it('returns creator guidance and lifecycle payload for a new room', async () => {
    const creatorSession = createSessionState();
    const response = await joinRoomController.handle(
      {},
      { sessionState: creatorSession },
    );
    const payload = parseJsonPayload(response);

    expect(payload.created_room).toBe(true);
    expect(payload.joined_existing).toBe(false);
    expect(payload.harness_guidance_version).toBe('v1');
    expect(typeof payload.harness_prompt).toBe('string');
    const harnessPrompt = payload.harness_prompt as string;
    expect(harnessPrompt).toContain('Autonomous loop:');
    expect(harnessPrompt).toContain('Do not ask for user input during the loop.');
    expect(harnessPrompt).toContain('Call join_room exactly once.');
    expect(harnessPrompt).toContain(
      'If you created the room, start polling start_game until the match starts.',
    );
    expect(harnessPrompt).toContain(
      'If you joined an existing room, start polling get_game_state until you should pick a party.',
    );
    expect(harnessPrompt).toContain('action.reasoning');
    expect(harnessPrompt).toContain('Forced switch rule:');

    const guidance = payload.harness_guidance as Record<string, unknown>;
    const autonomy = guidance.autonomy as Record<string, unknown>;
    const communicationPolicy = guidance.communication_policy as Record<
      string,
      unknown
    >;
    const responsePolicy = guidance.response_policy as Record<string, unknown>;
    const role = guidance.role as Record<string, unknown>;
    const nextAction = guidance.next_action as Record<string, unknown>;
    const status = guidance.current_status as Record<string, unknown>;
    const autonomousLoop = guidance.autonomous_loop as string[];
    const toolCall = nextAction.tool_call as Record<string, unknown>;
    const toolCallArgs = toolCall.arguments as Record<string, unknown>;

    expect(autonomy.human_input_required).toBe(false);
    expect(autonomy.ask_human_for_help).toBe(false);
    expect(communicationPolicy.user_questions_allowed).toBe(false);
    expect(communicationPolicy.confirmation_requests_allowed).toBe(false);
    expect(communicationPolicy.option_offers_allowed).toBe(false);
    expect(responsePolicy.silent_while_running).toBe(true);
    expect(Array.isArray(responsePolicy.final_report_events)).toBe(true);
    expect(Array.isArray(autonomousLoop)).toBe(true);
    expect(autonomousLoop.length).toBeGreaterThan(0);
    expect(
      autonomousLoop.some((step) =>
        step.includes('Do not ask for user input during the loop.'),
      ),
    ).toBe(true);
    expect(
      autonomousLoop.some((step) => step.includes('poll start_game')),
    ).toBe(true);
    expect(
      autonomousLoop.some((step) => step.includes('"reasoning":"<Reasoning>"')),
    ).toBe(true);
    expect(role.is_creator).toBe(true);
    expect(role.player_slot).toBe(1);
    expect(nextAction.type).toBe('start_game');
    expect(nextAction.human_input_required).toBe(false);
    expect(toolCall.tool).toBe('start_game');
    expect(toolCall.poll_interval_ms).toBe(1000);
    expect(toolCallArgs.room_handle).toBe(payload.room_handle);
    expect(status.your_party_selected).toBe(false);
  });

  it('returns idempotent join response with same room/player identifiers', async () => {
    const creatorSession = createSessionState();
    const firstJoin = await joinRoomController.handle(
      {},
      { sessionState: creatorSession },
    );
    const firstPayload = parseJsonPayload(firstJoin);
    const roomHandle = firstPayload.room_handle as string;
    const playerId = firstPayload.player_id as string;

    const secondJoin = await joinRoomController.handle(
      { room_handle: roomHandle },
      { sessionState: creatorSession },
    );
    const secondPayload = parseJsonPayload(secondJoin);

    expect(secondPayload.joined_existing).toBe(true);
    expect(secondPayload.room_handle).toBe(roomHandle);
    expect(secondPayload.player_id).toBe(playerId);
  });

  it('returns non-creator wait action and creator start action when room is full', async () => {
    const creatorSession = createSessionState();
    const creatorJoin = await joinRoomController.handle(
      {},
      { sessionState: creatorSession },
    );
    const creatorPayload = parseJsonPayload(creatorJoin);
    const roomHandle = creatorPayload.room_handle as string;

    const secondSession = createSessionState();
    const secondJoin = await joinRoomController.handle(
      { room_handle: roomHandle },
      { sessionState: secondSession },
    );
    const secondPayload = parseJsonPayload(secondJoin);
    const secondGuidance = secondPayload.harness_guidance as Record<
      string,
      unknown
    >;
    const secondRole = secondGuidance.role as Record<string, unknown>;
    const secondNextAction = secondGuidance.next_action as Record<
      string,
      unknown
    >;
    const secondToolCall = secondNextAction.tool_call as Record<string, unknown>;

    expect(secondRole.is_creator).toBe(false);
    expect(secondRole.player_slot).toBe(2);
    expect(secondNextAction.type).toBe('wait_for_creator_start');
    expect(secondNextAction.human_input_required).toBe(false);
    expect(secondToolCall.tool).toBe('get_game_state');

    const creatorRejoin = await joinRoomController.handle(
      { room_handle: roomHandle },
      { sessionState: creatorSession },
    );
    const creatorRejoinPayload = parseJsonPayload(creatorRejoin);
    const creatorGuidance = creatorRejoinPayload.harness_guidance as Record<
      string,
      unknown
    >;
    const creatorNextAction = creatorGuidance.next_action as Record<
      string,
      unknown
    >;

    expect(creatorRejoinPayload.joined_existing).toBe(true);
    expect(creatorNextAction.type).toBe('start_game');
  });

  it('returns select_party next action after the creator starts the game', async () => {
    const creatorSession = createSessionState();
    const creatorJoin = await joinRoomController.handle(
      {},
      { sessionState: creatorSession },
    );
    const creatorPayload = parseJsonPayload(creatorJoin);
    const roomHandle = creatorPayload.room_handle as string;

    const secondSession = createSessionState();
    await joinRoomController.handle(
      { room_handle: roomHandle },
      { sessionState: secondSession },
    );

    const startResponse = await startGameController.handle(
      { room_handle: roomHandle },
      { sessionState: creatorSession },
    );
    expect(startResponse.isError).toBeUndefined();

    const secondRejoin = await joinRoomController.handle(
      { room_handle: roomHandle },
      { sessionState: secondSession },
    );
    const secondPayload = parseJsonPayload(secondRejoin);
    const guidance = secondPayload.harness_guidance as Record<string, unknown>;
    const nextAction = guidance.next_action as Record<string, unknown>;
    const toolCall = nextAction.tool_call as Record<string, unknown>;
    const args = toolCall.arguments as Record<string, unknown>;

    expect(nextAction.type).toBe('select_party');
    expect(nextAction.human_input_required).toBe(false);
    expect(toolCall.tool).toBe('select_party');
    expect(args.room_handle).toBe(roomHandle);
    expect(args.p1).toBe('<PokemonName1>');
    expect(args.p2).toBe('<PokemonName2>');
    expect(args.p3).toBe('<PokemonName3>');
  });
});
