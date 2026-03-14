type SnapshotMove = {
  name: string;
  remainingPP: number;
  maxPP: number;
};

type SnapshotPokemon = {
  name: string;
  hp: number;
  maxHp: number;
  moves: SnapshotMove[];
};

type BoardPlayerSnapshot = {
  publicName: string;
  active: SnapshotPokemon;
  bench: SnapshotPokemon[];
};

type PartySelectionReasoningSnapshot = {
  playerId: string;
  publicName: string;
  party: {
    p1: string;
    p2: string;
    p3: string;
  } | null;
  reasoning: {
    p1Reason: string;
    p2Reason: string;
    p3Reason: string;
    leadReason: string;
  } | null;
};

type SubmittedTurnAction =
  | {
      type: 'attack';
      attackName: string;
      reasoning: string;
    }
  | {
      type: 'switch';
      newPokemon: string;
      reasoning: string;
    };

type AttackOutcomeSnapshot = {
  attackName: string;
  targetPokemon: string | null;
  damage: number;
  executed: boolean;
};

type SwitchOutcomeSnapshot = {
  fromPokemon: string | null;
  toPokemon: string;
  forced: boolean;
};

type PlayerTurnActionSnapshot = {
  playerId: string;
  publicName: string;
  submittedAction: SubmittedTurnAction | null;
  attackOutcome: AttackOutcomeSnapshot | null;
  switches: SwitchOutcomeSnapshot[];
};

type FaintedTurnPokemonSnapshot = {
  playerId: string;
  publicName: string;
  pokemonName: string;
};

type TurnActionTimelineEntrySnapshot =
  | {
      type: 'attack';
      playerId: string;
      publicName: string;
      attackName: string;
      targetPokemon: string | null;
      damage: number;
      outcome?: 'hit' | 'miss' | 'not_executed';
      reasoning: string;
    }
  | {
      type: 'switch';
      playerId: string;
      publicName: string;
      fromPokemon: string | null;
      toPokemon: string;
      forced: boolean;
      reasoning: string;
    }
  | {
      type: 'fainted';
      playerId: string;
      publicName: string;
      pokemonName: string;
    };

type TurnActionsSnapshot = {
  player1: PlayerTurnActionSnapshot;
  player2: PlayerTurnActionSnapshot;
  fainted: FaintedTurnPokemonSnapshot[];
  timeline: TurnActionTimelineEntrySnapshot[];
};

type TurnSnapshot = {
  turn: number;
  player1: BoardPlayerSnapshot;
  player2: BoardPlayerSnapshot;
  actions: TurnActionsSnapshot;
  capturedAt: string;
};

type SnapshotResponse = {
  roomId: string;
  phase: 'party_selection' | 'game_loop' | 'game_over';
  winner: string | null;
  latestTurn: number;
  partySelectionReasoning: PartySelectionReasoningSnapshot[];
  snapshots: TurnSnapshot[];
};

type RoomStatusEvent = {
  roomId: string;
  phase: 'party_selection' | 'game_loop' | 'game_over';
  winner: string | null;
  latestTurn: number;
  partySelectionReasoning: PartySelectionReasoningSnapshot[];
};

type CliOptions = {
  roomId: string;
  fromTurn: number;
  pollMs: number;
  once: boolean;
  server: string;
};

const HELP_TEXT = `Usage:
  bun run room-snapshots -- <room-id> [options]

Options:
  --from-turn <n>   Start printing at turn n (default: 1)
  --poll-ms <n>     Poll interval in milliseconds (default: 1000)
  --once            Print available snapshots once and exit
  --server <url>    Server base URL (default: http://127.0.0.1:6969)
  -h, --help        Show this help message
`;

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  if (!options) {
    console.log(HELP_TEXT.trimEnd());
    return;
  }

  const printedTurns = new Set<number>();
  let lastPrintedTurn = options.fromTurn - 1;

  if (options.once) {
    const response = await fetchSnapshots(options, options.fromTurn);
    printPartySelectionReasoning(response.partySelectionReasoning);
    lastPrintedTurn = printSnapshots(
      response.snapshots,
      printedTurns,
      lastPrintedTurn,
    );
    if (printedTurns.size === 0) {
      console.log(`No snapshots available yet for room '${options.roomId}'.`);
    }
    return;
  }

  try {
    lastPrintedTurn = await watchViaSse(options, printedTurns, lastPrintedTurn);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown SSE error';
    console.error(
      `SSE stream unavailable (${message}). Falling back to polling.`,
    );
  }

  await watchViaPolling(options, printedTurns, lastPrintedTurn);
}

function parseArgs(argv: string[]): CliOptions | null {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return null;
  }

  let roomId: string | null = null;
  let fromTurn = 1;
  let pollMs = 1000;
  let once = false;
  let server = 'http://127.0.0.1:6969';

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
      continue;
    }

    if (!current.startsWith('--')) {
      if (roomId === null) {
        roomId = current;
        continue;
      }

      throw new Error(`Unexpected argument '${current}'.`);
    }

    if (current === '--once') {
      once = true;
      continue;
    }

    if (current === '--from-turn') {
      const value = argv[i + 1];
      i += 1;
      const parsed = Number.parseInt(value ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid value for --from-turn: '${value ?? ''}'.`);
      }
      fromTurn = parsed;
      continue;
    }

    if (current === '--poll-ms') {
      const value = argv[i + 1];
      i += 1;
      const parsed = Number.parseInt(value ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 100) {
        throw new Error(
          `Invalid value for --poll-ms: '${value ?? ''}'. Must be >= 100.`,
        );
      }
      pollMs = parsed;
      continue;
    }

    if (current === '--server') {
      const value = argv[i + 1];
      i += 1;
      if (!value) {
        throw new Error('Missing value for --server.');
      }
      server = value;
      continue;
    }

    throw new Error(`Unknown option '${current}'.`);
  }

  if (!roomId) {
    throw new Error('Missing required room id argument.');
  }

  return {
    roomId,
    fromTurn,
    pollMs,
    once,
    server,
  };
}

async function watchViaSse(
  options: CliOptions,
  printedTurns: Set<number>,
  initialLastPrintedTurn: number,
): Promise<number> {
  const streamUrl = buildStreamUrl(
    options.server,
    options.roomId,
    options.fromTurn,
  );
  const response = await fetch(streamUrl, {
    headers: {
      accept: 'text/event-stream',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  if (!response.body) {
    throw new Error('No response body received for SSE stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastPrintedTurn = initialLastPrintedTurn;
  let printedPartyReasoning = false;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return lastPrintedTurn;
    }

    buffer += decoder.decode(chunk.value, { stream: true });
    const events = consumeSseEvents(buffer);
    buffer = events.remaining;

    for (const event of events.events) {
      if (!event.data) {
        continue;
      }

      if (event.event === 'turn_snapshot') {
        const snapshot = JSON.parse(event.data) as TurnSnapshot;
        if (!printedTurns.has(snapshot.turn)) {
          printTurnSnapshot(snapshot);
          printedTurns.add(snapshot.turn);
          lastPrintedTurn = Math.max(lastPrintedTurn, snapshot.turn);
        }
        continue;
      }

      if (event.event === 'room_status') {
        const status = JSON.parse(event.data) as RoomStatusEvent;
        if (
          !printedPartyReasoning &&
          hasAnyPartySelectionReasoning(status.partySelectionReasoning)
        ) {
          printPartySelectionReasoning(status.partySelectionReasoning);
          printedPartyReasoning = true;
        }
        if (
          status.phase === 'game_over' &&
          status.latestTurn <= lastPrintedTurn
        ) {
          await reader.cancel();
          return lastPrintedTurn;
        }
      }
    }
  }
}

async function watchViaPolling(
  options: CliOptions,
  printedTurns: Set<number>,
  initialLastPrintedTurn: number,
) {
  let fromTurn = Math.max(options.fromTurn, initialLastPrintedTurn + 1);
  let lastPrintedTurn = initialLastPrintedTurn;
  let printedPartyReasoning = false;

  while (true) {
    const response = await fetchSnapshots(options, fromTurn);
    if (
      !printedPartyReasoning &&
      hasAnyPartySelectionReasoning(response.partySelectionReasoning)
    ) {
      printPartySelectionReasoning(response.partySelectionReasoning);
      printedPartyReasoning = true;
    }
    lastPrintedTurn = printSnapshots(
      response.snapshots,
      printedTurns,
      lastPrintedTurn,
    );
    fromTurn = Math.max(fromTurn, lastPrintedTurn + 1);

    if (
      response.phase === 'game_over' &&
      response.latestTurn <= lastPrintedTurn
    ) {
      return;
    }

    await sleep(options.pollMs);
  }
}

async function fetchSnapshots(
  options: CliOptions,
  fromTurn: number,
): Promise<SnapshotResponse> {
  const url = buildSnapshotsUrl(options.server, options.roomId, fromTurn);
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch snapshots: HTTP ${response.status} - ${body}`,
    );
  }

  return (await response.json()) as SnapshotResponse;
}

function printSnapshots(
  snapshots: TurnSnapshot[],
  printedTurns: Set<number>,
  initialLastPrintedTurn: number,
): number {
  let lastPrintedTurn = initialLastPrintedTurn;
  const sorted = [...snapshots].sort((left, right) => left.turn - right.turn);
  for (const snapshot of sorted) {
    if (printedTurns.has(snapshot.turn)) {
      continue;
    }

    printTurnSnapshot(snapshot);
    printedTurns.add(snapshot.turn);
    lastPrintedTurn = Math.max(lastPrintedTurn, snapshot.turn);
  }

  return lastPrintedTurn;
}

function printTurnSnapshot(snapshot: TurnSnapshot) {
  console.log(`====== TURN ${snapshot.turn} =======`);
  printTurnActions(snapshot.actions);
  console.log('=== PLAYER 1 ===');
  console.log('');
  printPokemon('Active Pokemon', snapshot.player1.active);
  for (let i = 0; i < snapshot.player1.bench.length; i += 1) {
    const bench = snapshot.player1.bench[i];
    if (!bench) {
      continue;
    }
    printPokemon(`Bench ${i + 1}`, bench);
  }

  console.log('=== PLAYER 2 ===');
  console.log('');
  printPokemon('Active Pokemon', snapshot.player2.active);
  for (let i = 0; i < snapshot.player2.bench.length; i += 1) {
    const bench = snapshot.player2.bench[i];
    if (!bench) {
      continue;
    }
    printPokemon(`Bench ${i + 1}`, bench);
  }

  console.log(`====== TURN ${snapshot.turn} =======`);
  console.log('');
}

function printTurnActions(actions: TurnActionsSnapshot) {
  console.log('=== TURN ACTIONS ===');
  const timeline = actions.timeline ?? [];
  if (timeline.length > 0) {
    for (const entry of timeline) {
      if (entry.type === 'attack') {
        const targetPokemon = entry.targetPokemon ?? 'no target';
        if (entry.outcome === 'miss') {
          console.log(
            `${entry.publicName}: attack ${entry.attackName} -> ${targetPokemon} MISSED | reason: ${entry.reasoning}`,
          );
          continue;
        }
        if (entry.outcome === 'not_executed') {
          console.log(
            `${entry.publicName}: attack ${entry.attackName} -> did not execute | reason: ${entry.reasoning}`,
          );
          continue;
        }
        console.log(
          `${entry.publicName}: attack ${entry.attackName} -> ${targetPokemon} for ${entry.damage} damage | reason: ${entry.reasoning}`,
        );
        continue;
      }

      if (entry.type === 'switch') {
        const fromPokemon = entry.fromPokemon ?? 'unknown';
        console.log(
          `${entry.publicName}: switch ${fromPokemon} -> ${entry.toPokemon}${entry.forced ? ' (forced)' : ''} | reason: ${entry.reasoning}`,
        );
        continue;
      }

      console.log(
        `Fainted: ${entry.publicName} - ${entry.pokemonName}`,
      );
    }
  } else {
    printPlayerTurnAction(actions.player1);
    printPlayerTurnAction(actions.player2);

    if (actions.fainted.length === 0) {
      console.log('Fainted: none');
    } else {
      for (const faintedPokemon of actions.fainted) {
        console.log(
          `Fainted: ${faintedPokemon.publicName} - ${faintedPokemon.pokemonName}`,
        );
      }
    }
  }

  console.log('');
}

function printPlayerTurnAction(action: PlayerTurnActionSnapshot) {
  const submittedAction = action.submittedAction;
  if (!submittedAction) {
    console.log(`${action.publicName}: no submitted action recorded`);
    return;
  }

  if (submittedAction.type === 'attack') {
    const attackOutcome = action.attackOutcome;
    if (attackOutcome?.executed) {
      const targetPokemon = attackOutcome.targetPokemon ?? 'unknown target';
      console.log(
        `${action.publicName}: attack ${submittedAction.attackName} -> ${targetPokemon} for ${attackOutcome.damage} damage | reason: ${submittedAction.reasoning}`,
      );
    } else {
      console.log(
        `${action.publicName}: attack ${submittedAction.attackName} -> did not land (0 damage) | reason: ${submittedAction.reasoning}`,
      );
    }
  } else {
    const [firstSwitch, ...additionalSwitches] = action.switches;
    const switchForAction = firstSwitch ?? {
      fromPokemon: null,
      toPokemon: submittedAction.newPokemon,
      forced: false,
    };
    const fromPokemon = switchForAction.fromPokemon ?? 'unknown';
    console.log(
      `${action.publicName}: switch ${fromPokemon} -> ${switchForAction.toPokemon}${switchForAction.forced ? ' (forced)' : ''} | reason: ${submittedAction.reasoning}`,
    );

    for (const forcedSwitch of additionalSwitches) {
      const forcedFromPokemon = forcedSwitch.fromPokemon ?? 'unknown';
      console.log(
        `${action.publicName}: switch ${forcedFromPokemon} -> ${forcedSwitch.toPokemon}${forcedSwitch.forced ? ' (forced)' : ''} | reason: forced transition after submitted switch`,
      );
    }
    return;
  }

  if (action.switches.length > 0) {
    for (const switchOutcome of action.switches) {
      const fromPokemon = switchOutcome.fromPokemon ?? 'unknown';
      console.log(
        `${action.publicName}: switch ${fromPokemon} -> ${switchOutcome.toPokemon}${switchOutcome.forced ? ' (forced)' : ''} | reason: forced transition after submitted action`,
      );
    }
  }
}

function printPokemon(label: string, pokemon: SnapshotPokemon) {
  console.log(
    `${label}: ${pokemon.name} (${pokemon.hp} / ${pokemon.maxHp} HP)`,
  );
  for (const move of pokemon.moves) {
    console.log(`${move.name} (${move.remainingPP} / ${move.maxPP} PP)`);
  }
  console.log('');
}

function hasAnyPartySelectionReasoning(
  entries: PartySelectionReasoningSnapshot[] | undefined,
): boolean {
  if (!entries || entries.length === 0) {
    return false;
  }

  return entries.some((entry) => entry.reasoning !== null);
}

function printPartySelectionReasoning(
  entries: PartySelectionReasoningSnapshot[] | undefined,
) {
  if (!entries || entries.length === 0) {
    return;
  }

  if (!hasAnyPartySelectionReasoning(entries)) {
    return;
  }

  console.log('=== PARTY SELECTION REASONING ===');
  for (const entry of entries) {
    if (!entry.party || !entry.reasoning) {
      console.log(`${entry.publicName}: not submitted yet`);
      continue;
    }

    console.log(
      `${entry.publicName}: p1=${entry.party.p1} | reason=${entry.reasoning.p1Reason}`,
    );
    console.log(
      `${entry.publicName}: p2=${entry.party.p2} | reason=${entry.reasoning.p2Reason}`,
    );
    console.log(
      `${entry.publicName}: p3=${entry.party.p3} | reason=${entry.reasoning.p3Reason}`,
    );
    console.log(
      `${entry.publicName}: lead=${entry.party.p1} | lead_reason=${entry.reasoning.leadReason}`,
    );
  }
  console.log('');
}

function consumeSseEvents(buffer: string): {
  events: Array<{
    event: string;
    data: string;
  }>;
  remaining: string;
} {
  const normalized = buffer.replaceAll('\r\n', '\n');
  const chunks = normalized.split('\n\n');
  const completeChunkCount = normalized.endsWith('\n\n')
    ? chunks.length
    : chunks.length - 1;

  const events: Array<{ event: string; data: string }> = [];
  for (let index = 0; index < completeChunkCount; index += 1) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }

    let event = 'message';
    const dataLines: string[] = [];

    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    events.push({
      event,
      data: dataLines.join('\n'),
    });
  }

  const remaining =
    completeChunkCount < chunks.length ? (chunks[chunks.length - 1] ?? '') : '';
  return { events, remaining };
}

function buildSnapshotsUrl(
  server: string,
  roomId: string,
  fromTurn: number,
): string {
  const url = new URL(
    `/debug/rooms/${encodeURIComponent(roomId)}/snapshots`,
    normalizeServer(server),
  );
  url.searchParams.set('fromTurn', String(fromTurn));
  return url.toString();
}

function buildStreamUrl(
  server: string,
  roomId: string,
  fromTurn: number,
): string {
  const url = new URL(
    `/debug/rooms/${encodeURIComponent(roomId)}/snapshots/stream`,
    normalizeServer(server),
  );
  url.searchParams.set('fromTurn', String(fromTurn));
  return url.toString();
}

function normalizeServer(server: string): string {
  const normalized = server.endsWith('/') ? server : `${server}/`;
  return new URL(normalized).toString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(message);
  process.exitCode = 1;
});
