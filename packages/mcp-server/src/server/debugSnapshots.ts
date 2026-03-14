import {
  getRoom,
  getRoomSnapshotSummary,
  listPartySelectionReasoningSnapshots,
  listRoomTurnSnapshots,
  subscribeRoomTurnSnapshots,
  type PartySelectionReasoningSnapshot,
  type Room,
  type TurnSnapshot,
} from './rooms';

type DebugSnapshotsRoute =
  | {
      type: 'snapshots';
      roomId: string;
    }
  | {
      type: 'stream';
      roomId: string;
    };

type SnapshotResponse = {
  roomId: string;
  phase: 'party_selection' | 'game_loop' | 'game_over';
  winner: string | null;
  latestTurn: number;
  partySelectionReasoning: PartySelectionReasoningSnapshot[];
  snapshots: TurnSnapshot[];
};

export function handleDebugSnapshotsRoute(
  request: Request,
  url: URL,
): Response | null {
  const route = parseDebugSnapshotsRoute(url.pathname);
  if (!route) {
    return null;
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const room = getRoom(route.roomId);
  if (!room) {
    return jsonResponse(
      {
        error: `Room '${route.roomId}' not found.`,
      },
      404,
    );
  }

  const fromTurn = parseFromTurn(url.searchParams.get('fromTurn'));

  if (route.type === 'snapshots') {
    return jsonResponse(buildSnapshotResponse(room, fromTurn));
  }

  return createSnapshotsStreamResponse(request, room, fromTurn);
}

function parseDebugSnapshotsRoute(
  pathname: string,
): DebugSnapshotsRoute | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'debug' || parts[1] !== 'rooms') {
    return null;
  }

  const roomId = parts[2];
  if (!roomId) {
    return null;
  }

  if (parts.length === 4 && parts[3] === 'snapshots') {
    return {
      type: 'snapshots',
      roomId,
    };
  }

  if (parts.length === 5 && parts[3] === 'snapshots' && parts[4] === 'stream') {
    return {
      type: 'stream',
      roomId,
    };
  }

  return null;
}

function parseFromTurn(fromTurnValue: string | null): number {
  if (!fromTurnValue) {
    return 1;
  }

  const parsed = Number.parseInt(fromTurnValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function buildSnapshotResponse(room: Room, fromTurn: number): SnapshotResponse {
  const summary = getRoomSnapshotSummary(room);
  return {
    roomId: summary.roomId,
    phase: summary.phase,
    winner: summary.winner,
    latestTurn: summary.latestTurn,
    partySelectionReasoning: listPartySelectionReasoningSnapshots(room),
    snapshots: listRoomTurnSnapshots(room, fromTurn),
  };
}

function buildRoomStatusPayload(room: Room): {
  roomId: string;
  phase: 'party_selection' | 'game_loop' | 'game_over';
  winner: string | null;
  latestTurn: number;
  partySelectionReasoning: PartySelectionReasoningSnapshot[];
} {
  const summary = getRoomSnapshotSummary(room);
  return {
    roomId: summary.roomId,
    phase: summary.phase,
    winner: summary.winner,
    latestTurn: summary.latestTurn,
    partySelectionReasoning: listPartySelectionReasoningSnapshots(room),
  };
}

function createSnapshotsStreamResponse(
  request: Request,
  room: Room,
  fromTurn: number,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(toSseEvent(event, payload)));
        } catch {
          close();
        }
      };

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeatTimer);
        unsubscribe();
        request.signal.removeEventListener('abort', abortHandler);

        try {
          controller.close();
        } catch {
          // Stream already closed.
        }
      };

      const abortHandler = () => {
        close();
      };

      const unsubscribe = subscribeRoomTurnSnapshots(room, (snapshot) => {
        if (snapshot.turn < fromTurn) {
          return;
        }

        const status = buildRoomStatusPayload(room);
        send('room_status', status);
        send('turn_snapshot', snapshot);

        if (
          status.phase === 'game_over' &&
          status.latestTurn <= snapshot.turn
        ) {
          close();
        }
      });

      const heartbeatTimer = setInterval(() => {
        send('heartbeat', { ts: Date.now() });
      }, 15000);

      request.signal.addEventListener('abort', abortHandler);

      send('ready', {
        roomId: room.roomId,
        fromTurn,
      });

      const initialStatus = buildRoomStatusPayload(room);
      send('room_status', initialStatus);

      for (const snapshot of listRoomTurnSnapshots(room, fromTurn)) {
        send('turn_snapshot', snapshot);
      }

      if (initialStatus.phase === 'game_over') {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

function toSseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}
