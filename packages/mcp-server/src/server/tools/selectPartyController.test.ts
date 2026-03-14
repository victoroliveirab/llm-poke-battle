import { describe, expect, it } from 'bun:test';
import { handleDebugSnapshotsRoute } from '../debugSnapshots';
import { getPartySelectionReasoning, getRoom } from '../rooms';
import type { ToolResponse } from '../response';
import { createSessionState, type SessionState } from '../sessionState';
import { getGameStateController } from './getGameStateController';
import { joinRoomController } from './joinRoomController';
import { selectPartyController } from './selectPartyController';
import { startGameController } from './startGameController';

type SessionSetup = {
  roomHandle: string;
  player1Session: SessionState;
  player2Session: SessionState;
};

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

async function setupPartySelection(): Promise<SessionSetup> {
  const player1Session = createSessionState();
  const player2Session = createSessionState();

  const creatorJoin = await joinRoomController.handle(
    {},
    { sessionState: player1Session },
  );
  const roomHandle = parseJsonPayload(creatorJoin).room_handle;
  if (typeof roomHandle !== 'string' || roomHandle.length === 0) {
    throw new Error('Expected room handle from creator join.');
  }

  await joinRoomController.handle(
    { room_handle: roomHandle },
    { sessionState: player2Session },
  );

  const startResponse = await startGameController.handle(
    { room_handle: roomHandle },
    { sessionState: player1Session },
  );
  if (startResponse.isError) {
    throw new Error('Expected start_game to succeed in setup.');
  }

  return {
    roomHandle,
    player1Session,
    player2Session,
  };
}

describe('select_party reasoning requirement', () => {
  it('throws when lead_reason is missing', async () => {
    const setup = await setupPartySelection();

    expect(() =>
      selectPartyController.handle(
        {
          room_handle: setup.roomHandle,
          p1: 'Charizard',
          p2: 'Raichu',
          p3: 'Nidoking',
          p1_reason: 'Charizard gives early pressure.',
          p2_reason: 'Raichu offers speed control.',
          p3_reason: 'Nidoking covers grounded threats.',
        },
        { sessionState: setup.player1Session },
      ),
    ).toThrow('lead_reason');
  });

  it('throws when per-pick reasoning is empty', async () => {
    const setup = await setupPartySelection();

    expect(() =>
      selectPartyController.handle(
        {
          room_handle: setup.roomHandle,
          p1: 'Charizard',
          p2: 'Raichu',
          p3: 'Nidoking',
          p1_reason: 'Charizard gives early pressure.',
          p2_reason: '   ',
          p3_reason: 'Nidoking covers grounded threats.',
          lead_reason: 'Charizard opens to maximize tempo and flexible damage.',
        },
        { sessionState: setup.player1Session },
      ),
    ).toThrow('p2_reason');
  });

  it('returns and stores party reasoning, exposes it in debug snapshots only', async () => {
    const setup = await setupPartySelection();
    const p1Reason = 'Charizard gives immediate pressure and flexible coverage.';
    const p2Reason = 'Raichu is the fastest backup for cleanup turns.';
    const p3Reason = 'Nidoking is the bulky pivot into electric threats.';
    const leadReason =
      'Charizard leads because it has the best early-game matchup spread and keeps momentum options open.';

    const selectResponse = await selectPartyController.handle(
      {
        room_handle: setup.roomHandle,
        p1: 'Charizard',
        p2: 'Raichu',
        p3: 'Nidoking',
        p1_reason: p1Reason,
        p2_reason: p2Reason,
        p3_reason: p3Reason,
        lead_reason: leadReason,
      },
      { sessionState: setup.player1Session },
    );

    const selectPayload = parseJsonPayload(selectResponse);
    const returnedReasoning = selectPayload.party_reasoning as Record<
      string,
      unknown
    >;
    expect(returnedReasoning.p1_reason).toBe(p1Reason);
    expect(returnedReasoning.p2_reason).toBe(p2Reason);
    expect(returnedReasoning.p3_reason).toBe(p3Reason);
    expect(returnedReasoning.lead_reason).toBe(leadReason);

    const room = getRoom(setup.roomHandle);
    if (!room) {
      throw new Error('Expected room for reasoning assertions.');
    }

    const player1Id = setup.player1Session.joinedRooms.get(setup.roomHandle)
      ?.playerId;
    if (!player1Id) {
      throw new Error('Expected player 1 membership in setup.');
    }

    const storedReasoning = getPartySelectionReasoning(room, player1Id);
    expect(storedReasoning?.p1Reason).toBe(p1Reason);
    expect(storedReasoning?.p2Reason).toBe(p2Reason);
    expect(storedReasoning?.p3Reason).toBe(p3Reason);
    expect(storedReasoning?.leadReason).toBe(leadReason);

    const selfState = await getGameStateController.handle(
      { room_handle: setup.roomHandle },
      { sessionState: setup.player1Session },
    );
    const selfPayload = parseJsonPayload(selfState);
    expect('party_reasoning' in selfPayload).toBe(false);
    expect(JSON.stringify(selfPayload).includes(leadReason)).toBe(false);

    const opponentState = await getGameStateController.handle(
      { room_handle: setup.roomHandle },
      { sessionState: setup.player2Session },
    );
    const opponentPayload = parseJsonPayload(opponentState);
    expect(JSON.stringify(opponentPayload).includes(leadReason)).toBe(false);

    const debugUrl = new URL(
      `http://127.0.0.1:6969/debug/rooms/${setup.roomHandle}/snapshots?fromTurn=1`,
    );
    const debugResponse = handleDebugSnapshotsRoute(
      new Request(debugUrl.toString()),
      debugUrl,
    );
    if (!debugResponse) {
      throw new Error('Expected debug snapshots route response.');
    }
    if (debugResponse.status !== 200) {
      throw new Error(`Expected debug snapshots status 200, got ${debugResponse.status}.`);
    }
    const debugPayload = (await debugResponse.json()) as Record<string, unknown>;
    const reasoningEntries = debugPayload.partySelectionReasoning as Array<
      Record<string, unknown>
    >;
    const player1Entry = reasoningEntries.find(
      (entry) => entry.publicName === 'Player 1',
    );
    const player1EntryReasoning = player1Entry?.reasoning as
      | Record<string, unknown>
      | undefined;
    expect(player1EntryReasoning?.p1Reason).toBe(p1Reason);
    expect(player1EntryReasoning?.p2Reason).toBe(p2Reason);
    expect(player1EntryReasoning?.p3Reason).toBe(p3Reason);
    expect(player1EntryReasoning?.leadReason).toBe(leadReason);
  });

  it('returns an error when start_game is called after the game has started', async () => {
    const setup = await setupPartySelection();

    await selectPartyController.handle(
      {
        room_handle: setup.roomHandle,
        p1: 'Charizard',
        p2: 'Raichu',
        p3: 'Nidoking',
        p1_reason: 'Lead pressure.',
        p2_reason: 'Speed control.',
        p3_reason: 'Coverage option.',
        lead_reason: 'Charizard has the safest lead profile.',
      },
      { sessionState: setup.player1Session },
    );
    await selectPartyController.handle(
      {
        room_handle: setup.roomHandle,
        p1: 'Nidoking',
        p2: 'Raichu',
        p3: 'Charizard',
        p1_reason: 'Lead for immediate threat.',
        p2_reason: 'Second-line speed.',
        p3_reason: 'Late pivot option.',
        lead_reason: 'Nidoking opens to pressure likely electric lines.',
      },
      { sessionState: setup.player2Session },
    );

    const secondStartResponse = await startGameController.handle(
      { room_handle: setup.roomHandle },
      { sessionState: setup.player1Session },
    );
    expect(secondStartResponse.isError).toBe(true);
    expect(secondStartResponse.content[0]?.text).toContain('Game already started.');

    const room = getRoom(setup.roomHandle);
    if (!room) {
      throw new Error('Expected room for assertions.');
    }
    const player1Id = setup.player1Session.joinedRooms.get(setup.roomHandle)
      ?.playerId;
    const player2Id = setup.player2Session.joinedRooms.get(setup.roomHandle)
      ?.playerId;
    if (!player1Id || !player2Id) {
      throw new Error('Expected player ids for assertions.');
    }

    expect(getPartySelectionReasoning(room, player1Id)).not.toBeNull();
    expect(getPartySelectionReasoning(room, player2Id)).not.toBeNull();

    const stateAfterFailedRestart = await getGameStateController.handle(
      { room_handle: setup.roomHandle },
      { sessionState: setup.player1Session },
    );
    const statePayload = parseJsonPayload(stateAfterFailedRestart);
    expect(statePayload.phase).toBe('game_loop');
  });
});
