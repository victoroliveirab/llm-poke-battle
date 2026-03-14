import { randomUUID } from 'node:crypto';
import { Battle } from '@poke-battle/battle-engine';

export const MAX_PLAYERS_PER_ROOM = 2;

export type SnapshotPhase = 'party_selection' | 'game_loop' | 'game_over';

export type SnapshotMove = {
  name: string;
  remainingPP: number;
  maxPP: number;
};

export type SnapshotPokemon = {
  name: string;
  hp: number;
  maxHp: number;
  moves: SnapshotMove[];
};

export type BoardPlayerSnapshot = {
  publicName: string;
  active: SnapshotPokemon;
  bench: SnapshotPokemon[];
};

export type SubmittedTurnAction =
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

export type InterTurnSwitchAction = {
  fromPokemon: string | null;
  toPokemon: string;
  reasoning: string;
};

export type PartySelectionReasoning = {
  p1: string;
  p2: string;
  p3: string;
  p1Reason: string;
  p2Reason: string;
  p3Reason: string;
  leadReason: string;
};

export type PartySelectionReasoningSnapshot = {
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

export type AttackOutcomeSnapshot = {
  attackName: string;
  targetPokemon: string | null;
  damage: number;
  executed: boolean;
};

export type SwitchOutcomeSnapshot = {
  fromPokemon: string | null;
  toPokemon: string;
  forced: boolean;
};

export type PlayerTurnActionSnapshot = {
  playerId: string;
  publicName: string;
  submittedAction: SubmittedTurnAction | null;
  attackOutcome: AttackOutcomeSnapshot | null;
  switches: SwitchOutcomeSnapshot[];
};

export type FaintedTurnPokemonSnapshot = {
  playerId: string;
  publicName: string;
  pokemonName: string;
};

export type TurnActionTimelineEntrySnapshot =
  | {
      type: 'attack';
      playerId: string;
      publicName: string;
      attackName: string;
      targetPokemon: string | null;
      damage: number;
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

export type TurnActionsSnapshot = {
  player1: PlayerTurnActionSnapshot;
  player2: PlayerTurnActionSnapshot;
  fainted: FaintedTurnPokemonSnapshot[];
  timeline: TurnActionTimelineEntrySnapshot[];
};

export type TurnSnapshot = {
  turn: number;
  player1: BoardPlayerSnapshot;
  player2: BoardPlayerSnapshot;
  actions: TurnActionsSnapshot;
  capturedAt: string;
};

type BattleDomainEvent = ReturnType<Battle['selectAction']>[number];

type TurnResolutionDetails = {
  emittedEvents: BattleDomainEvent[];
  preTurnActivePokemonByPlayerId: Map<string, string>;
  submittedActionsByPlayerId: Map<string, SubmittedTurnAction>;
  pendingInterTurnSwitchesByPlayerId: Map<string, InterTurnSwitchAction[]>;
};

export type RoomSnapshotSummary = {
  roomId: string;
  phase: SnapshotPhase;
  winner: string | null;
  latestTurn: number;
};

type RoomSnapshotSubscriber = (snapshot: TurnSnapshot) => void;

export type Room = {
  roomId: string;
  game?: Battle;
  players: Map<string, string>;
  creatorPlayerId: string | null;
  gameStarted: boolean;
  pendingTurnActions: Map<string, SubmittedTurnAction>;
  pendingInterTurnSwitches: Map<string, InterTurnSwitchAction[]>;
  partySelectionReasoningByPlayerId: Map<string, PartySelectionReasoning>;
  turnSnapshots: TurnSnapshot[];
  lastSnapshottedTurn: number;
  snapshotSubscribers: Set<RoomSnapshotSubscriber>;
};

export type RoomMembership = {
  playerId: string;
  publicName: string;
};

export type RoomPlayer = {
  playerId: string;
  publicName: string;
  slot: 1 | 2;
};

const rooms = new Map<string, Room>();
const UNRECORDED_ATTACK_REASONING = 'No attack reasoning was recorded.';
const FORCED_SWITCH_REASONING =
  'Forced switch triggered by battle state; this switch was not a direct submitted action.';

export function createRoom(): Room {
  const roomId = randomUUID();
  const room: Room = {
    roomId,
    players: new Map<string, string>(),
    creatorPlayerId: null,
    gameStarted: false,
    pendingTurnActions: new Map<string, SubmittedTurnAction>(),
    pendingInterTurnSwitches: new Map<string, InterTurnSwitchAction[]>(),
    partySelectionReasoningByPlayerId: new Map<
      string,
      PartySelectionReasoning
    >(),
    turnSnapshots: [],
    lastSnapshottedTurn: 0,
    snapshotSubscribers: new Set<RoomSnapshotSubscriber>(),
  };

  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomHandle: string): Room | undefined {
  return rooms.get(roomHandle);
}

export function addPlayerToRoom(room: Room): RoomMembership {
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    throw new Error(
      `Room '${room.roomId}' is full (max ${MAX_PLAYERS_PER_ROOM} players).`,
    );
  }

  const playerId = randomUUID();
  const publicName = `Player ${room.players.size + 1}`;
  room.players.set(playerId, publicName);
  if (!room.creatorPlayerId) {
    room.creatorPlayerId = playerId;
  }

  if (room.players.size === 2) {
    room.game = buildBattleForRoom(room);
  }

  return { playerId, publicName };
}

export function listPlayersInRoom(room: Room): string[] {
  return Array.from(room.players.values());
}

export function isRoomFull(room: Room): boolean {
  return room.players.size >= MAX_PLAYERS_PER_ROOM;
}

export function listRoomPlayers(room: Room): RoomPlayer[] {
  return Array.from(room.players.entries()).map(
    ([playerId, publicName], index) => ({
      playerId,
      publicName,
      slot: index === 0 ? 1 : 2,
    }),
  );
}

export function markRoomGameStarted(room: Room): void {
  room.gameStarted = true;
}

export function resetRoomGame(room: Room): Battle {
  const game = buildBattleForRoom(room);
  room.game = game;
  room.pendingTurnActions.clear();
  room.pendingInterTurnSwitches.clear();
  room.partySelectionReasoningByPlayerId.clear();
  room.turnSnapshots = [];
  room.lastSnapshottedTurn = 0;
  return game;
}

export function getRoomSnapshotSummary(room: Room): RoomSnapshotSummary {
  return {
    roomId: room.roomId,
    phase: room.game ? room.game.getPhase() : 'party_selection',
    winner: getWinner(room),
    latestTurn: room.lastSnapshottedTurn,
  };
}

export function listRoomTurnSnapshots(
  room: Room,
  fromTurn = 1,
): TurnSnapshot[] {
  const normalizedFromTurn = fromTurn > 0 ? fromTurn : 1;
  return room.turnSnapshots
    .filter((snapshot) => snapshot.turn >= normalizedFromTurn)
    .map(cloneTurnSnapshot);
}

export function hasTurnSnapshot(room: Room, turn: number): boolean {
  return room.lastSnapshottedTurn >= turn;
}

export function captureRoomTurnSnapshot(
  room: Room,
  turn: number,
  resolutionDetails?: TurnResolutionDetails,
): TurnSnapshot {
  if (!room.game) {
    throw new Error(`Room '${room.roomId}' does not have an active game.`);
  }

  if (turn < 1) {
    throw new Error(`Invalid turn '${turn}'. Turn must be >= 1.`);
  }

  const players = listRoomPlayers(room);
  if (players.length !== MAX_PLAYERS_PER_ROOM) {
    throw new Error(
      `Cannot build snapshot for room '${room.roomId}'. Expected exactly ${MAX_PLAYERS_PER_ROOM} players.`,
    );
  }

  const player1 = players.find((player) => player.slot === 1);
  const player2 = players.find((player) => player.slot === 2);

  if (!player1 || !player2) {
    throw new Error(
      `Cannot build snapshot for room '${room.roomId}'. Missing player slots.`,
    );
  }

  const snapshot: TurnSnapshot = {
    turn,
    player1: buildBoardPlayerSnapshot(
      room.game,
      player1.playerId,
      player1.publicName,
    ),
    player2: buildBoardPlayerSnapshot(
      room.game,
      player2.playerId,
      player2.publicName,
    ),
    actions: buildTurnActionsSnapshot(
      player1,
      player2,
      resolutionDetails,
    ),
    capturedAt: new Date().toISOString(),
  };

  room.turnSnapshots.push(snapshot);
  room.lastSnapshottedTurn = Math.max(room.lastSnapshottedTurn, turn);

  for (const subscriber of room.snapshotSubscribers) {
    subscriber(cloneTurnSnapshot(snapshot));
  }

  return cloneTurnSnapshot(snapshot);
}

export function setPendingTurnAction(
  room: Room,
  playerId: string,
  action: SubmittedTurnAction,
): void {
  if (action.type === 'attack') {
    room.pendingTurnActions.set(playerId, {
      type: 'attack',
      attackName: action.attackName,
      reasoning: action.reasoning,
    });
    return;
  }

  room.pendingTurnActions.set(playerId, {
    type: 'switch',
    newPokemon: action.newPokemon,
    reasoning: action.reasoning,
  });
}

export function snapshotPendingTurnActions(
  room: Room,
): Map<string, SubmittedTurnAction> {
  return new Map(
    Array.from(room.pendingTurnActions.entries()).map(([playerId, action]) => [
      playerId,
      action.type === 'attack'
        ? {
            type: 'attack' as const,
            attackName: action.attackName,
            reasoning: action.reasoning,
          }
        : {
            type: 'switch' as const,
            newPokemon: action.newPokemon,
            reasoning: action.reasoning,
          },
    ]),
  );
}

export function clearPendingTurnActions(room: Room): void {
  room.pendingTurnActions.clear();
}

export function queuePendingInterTurnSwitch(
  room: Room,
  playerId: string,
  action: InterTurnSwitchAction,
): void {
  const existing = room.pendingInterTurnSwitches.get(playerId) ?? [];
  existing.push({
    fromPokemon: action.fromPokemon,
    toPokemon: action.toPokemon,
    reasoning: action.reasoning,
  });
  room.pendingInterTurnSwitches.set(playerId, existing);
}

export function snapshotPendingInterTurnSwitches(
  room: Room,
): Map<string, InterTurnSwitchAction[]> {
  return new Map(
    Array.from(room.pendingInterTurnSwitches.entries()).map(
      ([playerId, actions]) => [
        playerId,
        actions.map((action) => ({
          fromPokemon: action.fromPokemon,
          toPokemon: action.toPokemon,
          reasoning: action.reasoning,
        })),
      ],
    ),
  );
}

export function clearPendingInterTurnSwitches(room: Room): void {
  room.pendingInterTurnSwitches.clear();
}

export function setPartySelectionReasoning(
  room: Room,
  playerId: string,
  reasoning: PartySelectionReasoning,
): void {
  room.partySelectionReasoningByPlayerId.set(
    playerId,
    clonePartySelectionReasoning(reasoning),
  );
}

export function getPartySelectionReasoning(
  room: Room,
  playerId: string,
): PartySelectionReasoning | null {
  const reasoning = room.partySelectionReasoningByPlayerId.get(playerId);
  if (!reasoning) {
    return null;
  }

  return clonePartySelectionReasoning(reasoning);
}

export function snapshotPartySelectionReasoning(
  room: Room,
): Map<string, PartySelectionReasoning> {
  return new Map(
    Array.from(room.partySelectionReasoningByPlayerId.entries()).map(
      ([playerId, reasoning]) => [
        playerId,
        clonePartySelectionReasoning(reasoning),
      ],
    ),
  );
}

export function listPartySelectionReasoningSnapshots(
  room: Room,
): PartySelectionReasoningSnapshot[] {
  return listRoomPlayers(room).map((player) => {
    const reasoning = room.partySelectionReasoningByPlayerId.get(player.playerId);
    if (!reasoning) {
      return {
        playerId: player.playerId,
        publicName: player.publicName,
        party: null,
        reasoning: null,
      };
    }

    return {
      playerId: player.playerId,
      publicName: player.publicName,
      party: {
        p1: reasoning.p1,
        p2: reasoning.p2,
        p3: reasoning.p3,
      },
      reasoning: {
        p1Reason: reasoning.p1Reason,
        p2Reason: reasoning.p2Reason,
        p3Reason: reasoning.p3Reason,
        leadReason: reasoning.leadReason,
      },
    };
  });
}

export function subscribeRoomTurnSnapshots(
  room: Room,
  subscriber: RoomSnapshotSubscriber,
): () => void {
  room.snapshotSubscribers.add(subscriber);
  return () => {
    room.snapshotSubscribers.delete(subscriber);
  };
}

type FullPartyEntry = {
  name: string;
  health: number;
  stats: {
    hp: number;
  };
  moves: Array<{
    name: string;
    remaining: number;
    maxPP: number;
  }>;
};

function buildBoardPlayerSnapshot(
  game: Battle,
  playerId: string,
  publicName: string,
): BoardPlayerSnapshot {
  const party = game.getParty(playerId, playerId) as FullPartyEntry[];
  const active = party[0];

  if (!active) {
    throw new Error(
      `Cannot capture snapshot for player '${playerId}': active Pokemon not found.`,
    );
  }

  return {
    publicName,
    active: buildSnapshotPokemon(active),
    bench: party.slice(1).map(buildSnapshotPokemon),
  };
}

function buildSnapshotPokemon(entry: FullPartyEntry): SnapshotPokemon {
  return {
    name: entry.name,
    hp: entry.health,
    maxHp: entry.stats.hp,
    moves: entry.moves.map((move) => ({
      name: move.name,
      remainingPP: move.remaining,
      maxPP: move.maxPP,
    })),
  };
}

function getWinner(room: Room): string | null {
  if (!room.game || room.players.size === 0) {
    return null;
  }

  const firstPlayerId = room.players.keys().next().value;
  if (typeof firstPlayerId !== 'string' || firstPlayerId.length === 0) {
    return null;
  }

  return room.game.getStateAsPlayer(firstPlayerId).winner;
}

function buildTurnActionsSnapshot(
  player1: RoomPlayer,
  player2: RoomPlayer,
  resolutionDetails?: TurnResolutionDetails,
): TurnActionsSnapshot {
  const submittedActions = resolutionDetails?.submittedActionsByPlayerId ?? new Map();
  const pendingInterTurnSwitches =
    resolutionDetails?.pendingInterTurnSwitchesByPlayerId ?? new Map();
  const preTurnActivePokemon =
    resolutionDetails?.preTurnActivePokemonByPlayerId ?? new Map();
  const emittedEvents = resolutionDetails?.emittedEvents ?? [];
  const switchesByPlayer = new Map<string, SwitchOutcomeSnapshot[]>();
  const emittedSwitchCountByPlayer = new Map<string, number>();
  const attackOutcomeByPlayer = new Map<string, AttackOutcomeSnapshot>();
  const fainted: FaintedTurnPokemonSnapshot[] = [];
  const timeline: TurnActionTimelineEntrySnapshot[] = [];
  const playersById = new Map<string, RoomPlayer>([
    [player1.playerId, player1],
    [player2.playerId, player2],
  ]);
  const recordSwitch = (params: {
    playerId: string;
    fromPokemon: string | null;
    toPokemon: string;
    forced: boolean;
    reasoning: string;
  }) => {
    const switches = switchesByPlayer.get(params.playerId) ?? [];
    const switchOutcome: SwitchOutcomeSnapshot = {
      fromPokemon: params.fromPokemon,
      toPokemon: params.toPokemon,
      forced: params.forced,
    };
    switches.push(switchOutcome);
    switchesByPlayer.set(params.playerId, switches);
    const player = playersById.get(params.playerId);
    if (player) {
      timeline.push({
        type: 'switch',
        playerId: params.playerId,
        publicName: player.publicName,
        fromPokemon: switchOutcome.fromPokemon,
        toPokemon: switchOutcome.toPokemon,
        forced: switchOutcome.forced,
        reasoning: params.reasoning,
      });
    }
  };

  for (const player of [player1, player2]) {
    const queuedSwitches = pendingInterTurnSwitches.get(player.playerId) ?? [];
    for (const queuedSwitch of queuedSwitches) {
      recordSwitch({
        playerId: player.playerId,
        fromPokemon: queuedSwitch.fromPokemon,
        toPokemon: queuedSwitch.toPokemon,
        forced: true,
        reasoning: queuedSwitch.reasoning,
      });
    }
  }

  for (const event of emittedEvents) {
    if (event.type === 'damage.applied') {
      const submittedAction = submittedActions.get(event.sourcePlayerId);
      const attackName =
        submittedAction?.type === 'attack'
          ? submittedAction.attackName
          : event.moveName;
      const reasoning =
        submittedAction?.type === 'attack'
          ? submittedAction.reasoning
          : UNRECORDED_ATTACK_REASONING;
      const sourcePlayer = playersById.get(event.sourcePlayerId);
      attackOutcomeByPlayer.set(event.sourcePlayerId, {
        attackName,
        targetPokemon: event.pokemonName,
        damage: event.damage,
        executed: true,
      });
      if (sourcePlayer) {
        timeline.push({
          type: 'attack',
          playerId: event.sourcePlayerId,
          publicName: sourcePlayer.publicName,
          attackName,
          targetPokemon: event.pokemonName,
          damage: event.damage,
          reasoning,
        });
      }
      continue;
    }

    if (event.type === 'pokemon.switched') {
      const switches = switchesByPlayer.get(event.playerId) ?? [];
      const previousSwitch = switches[switches.length - 1];
      const fromPokemon =
        previousSwitch?.toPokemon ??
        preTurnActivePokemon.get(event.playerId) ??
        null;
      const submittedAction = submittedActions.get(event.playerId);
      const emittedSwitchCount =
        emittedSwitchCountByPlayer.get(event.playerId) ?? 0;
      const isSubmittedSwitch =
        submittedAction?.type === 'switch' &&
        submittedAction.newPokemon === event.pokemonName &&
        emittedSwitchCount === 0;
      const reasoning =
        submittedAction?.type === 'switch' && isSubmittedSwitch
          ? submittedAction.reasoning
          : FORCED_SWITCH_REASONING;
      const switchOutcome: SwitchOutcomeSnapshot = {
        fromPokemon,
        toPokemon: event.pokemonName,
        forced: !isSubmittedSwitch,
      };
      recordSwitch({
        playerId: event.playerId,
        fromPokemon: switchOutcome.fromPokemon,
        toPokemon: switchOutcome.toPokemon,
        forced: switchOutcome.forced,
        reasoning,
      });
      emittedSwitchCountByPlayer.set(event.playerId, emittedSwitchCount + 1);
      continue;
    }

    if (event.type === 'pokemon.fainted') {
      const player = playersById.get(event.playerId);
      if (!player) {
        continue;
      }

      fainted.push({
        playerId: event.playerId,
        publicName: player.publicName,
        pokemonName: event.pokemonName,
      });
      timeline.push({
        type: 'fainted',
        playerId: event.playerId,
        publicName: player.publicName,
        pokemonName: event.pokemonName,
      });
    }
  }

  for (const player of [player1, player2]) {
    const submittedAction = submittedActions.get(player.playerId);
    if (
      submittedAction?.type === 'attack' &&
      !attackOutcomeByPlayer.has(player.playerId)
    ) {
      attackOutcomeByPlayer.set(player.playerId, {
        attackName: submittedAction.attackName,
        targetPokemon: null,
        damage: 0,
        executed: false,
      });
    }

    if (
      submittedAction?.type === 'attack' &&
      !timeline.some(
        (entry) => entry.type === 'attack' && entry.playerId === player.playerId,
      )
    ) {
      timeline.push({
        type: 'attack',
        playerId: player.playerId,
        publicName: player.publicName,
        attackName: submittedAction.attackName,
        targetPokemon: null,
        damage: 0,
        reasoning: submittedAction.reasoning,
      });
    }
  }

  return {
    player1: {
      playerId: player1.playerId,
      publicName: player1.publicName,
      submittedAction: cloneSubmittedTurnAction(
        submittedActions.get(player1.playerId),
      ),
      attackOutcome: cloneAttackOutcomeSnapshot(
        attackOutcomeByPlayer.get(player1.playerId),
      ),
      switches: cloneSwitchOutcomeSnapshots(
        switchesByPlayer.get(player1.playerId),
      ),
    },
    player2: {
      playerId: player2.playerId,
      publicName: player2.publicName,
      submittedAction: cloneSubmittedTurnAction(
        submittedActions.get(player2.playerId),
      ),
      attackOutcome: cloneAttackOutcomeSnapshot(
        attackOutcomeByPlayer.get(player2.playerId),
      ),
      switches: cloneSwitchOutcomeSnapshots(
        switchesByPlayer.get(player2.playerId),
      ),
    },
    fainted: cloneFaintedTurnPokemonSnapshots(fainted),
    timeline: cloneTurnActionTimelineEntries(timeline),
  };
}

function cloneTurnSnapshot(snapshot: TurnSnapshot): TurnSnapshot {
  return {
    turn: snapshot.turn,
    capturedAt: snapshot.capturedAt,
    player1: cloneBoardPlayerSnapshot(snapshot.player1),
    player2: cloneBoardPlayerSnapshot(snapshot.player2),
    actions: cloneTurnActionsSnapshot(snapshot.actions),
  };
}

function cloneBoardPlayerSnapshot(
  snapshot: BoardPlayerSnapshot,
): BoardPlayerSnapshot {
  return {
    publicName: snapshot.publicName,
    active: cloneSnapshotPokemon(snapshot.active),
    bench: snapshot.bench.map(cloneSnapshotPokemon),
  };
}

function cloneSnapshotPokemon(snapshot: SnapshotPokemon): SnapshotPokemon {
  return {
    name: snapshot.name,
    hp: snapshot.hp,
    maxHp: snapshot.maxHp,
    moves: snapshot.moves.map((move) => ({
      name: move.name,
      remainingPP: move.remainingPP,
      maxPP: move.maxPP,
    })),
  };
}

function cloneTurnActionsSnapshot(
  snapshot: TurnActionsSnapshot,
): TurnActionsSnapshot {
  return {
    player1: clonePlayerTurnActionSnapshot(snapshot.player1),
    player2: clonePlayerTurnActionSnapshot(snapshot.player2),
    fainted: cloneFaintedTurnPokemonSnapshots(snapshot.fainted),
    timeline: cloneTurnActionTimelineEntries(snapshot.timeline),
  };
}

function clonePlayerTurnActionSnapshot(
  snapshot: PlayerTurnActionSnapshot,
): PlayerTurnActionSnapshot {
  return {
    playerId: snapshot.playerId,
    publicName: snapshot.publicName,
    submittedAction: cloneSubmittedTurnAction(snapshot.submittedAction),
    attackOutcome: cloneAttackOutcomeSnapshot(snapshot.attackOutcome),
    switches: cloneSwitchOutcomeSnapshots(snapshot.switches),
  };
}

function cloneSubmittedTurnAction(
  action: SubmittedTurnAction | undefined | null,
): SubmittedTurnAction | null {
  if (!action) {
    return null;
  }

  if (action.type === 'attack') {
    return {
      type: 'attack',
      attackName: action.attackName,
      reasoning: action.reasoning,
    };
  }

  return {
    type: 'switch',
    newPokemon: action.newPokemon,
    reasoning: action.reasoning,
  };
}

function cloneAttackOutcomeSnapshot(
  attackOutcome: AttackOutcomeSnapshot | undefined | null,
): AttackOutcomeSnapshot | null {
  if (!attackOutcome) {
    return null;
  }

  return {
    attackName: attackOutcome.attackName,
    targetPokemon: attackOutcome.targetPokemon,
    damage: attackOutcome.damage,
    executed: attackOutcome.executed,
  };
}

function cloneSwitchOutcomeSnapshots(
  switches: SwitchOutcomeSnapshot[] | undefined,
): SwitchOutcomeSnapshot[] {
  if (!switches) {
    return [];
  }

  return switches.map((entry) => ({
    fromPokemon: entry.fromPokemon,
    toPokemon: entry.toPokemon,
    forced: entry.forced,
  }));
}

function cloneFaintedTurnPokemonSnapshots(
  fainted: FaintedTurnPokemonSnapshot[],
): FaintedTurnPokemonSnapshot[] {
  return fainted.map((entry) => ({
    playerId: entry.playerId,
    publicName: entry.publicName,
    pokemonName: entry.pokemonName,
  }));
}

function cloneTurnActionTimelineEntries(
  entries: TurnActionTimelineEntrySnapshot[],
): TurnActionTimelineEntrySnapshot[] {
  return entries.map((entry) => {
    if (entry.type === 'attack') {
      return {
        type: 'attack',
        playerId: entry.playerId,
        publicName: entry.publicName,
        attackName: entry.attackName,
        targetPokemon: entry.targetPokemon,
        damage: entry.damage,
        reasoning: entry.reasoning,
      };
    }

    if (entry.type === 'switch') {
      return {
        type: 'switch',
        playerId: entry.playerId,
        publicName: entry.publicName,
        fromPokemon: entry.fromPokemon,
        toPokemon: entry.toPokemon,
        forced: entry.forced,
        reasoning: entry.reasoning,
      };
    }

    return {
      type: 'fainted',
      playerId: entry.playerId,
      publicName: entry.publicName,
      pokemonName: entry.pokemonName,
    };
  });
}

function clonePartySelectionReasoning(
  reasoning: PartySelectionReasoning,
): PartySelectionReasoning {
  return {
    p1: reasoning.p1,
    p2: reasoning.p2,
    p3: reasoning.p3,
    p1Reason: reasoning.p1Reason,
    p2Reason: reasoning.p2Reason,
    p3Reason: reasoning.p3Reason,
    leadReason: reasoning.leadReason,
  };
}

function buildBattleForRoom(room: Room): Battle {
  const players = Array.from(room.players.entries()).map(
    ([playerId, publicName]) => ({
      id: playerId,
      name: publicName,
    }),
  );

  if (players.length !== MAX_PLAYERS_PER_ROOM) {
    throw new Error(
      `Cannot build battle for room '${room.roomId}'. Expected exactly ${MAX_PLAYERS_PER_ROOM} players.`,
    );
  }

  return new Battle({
    partySize: 3,
    players,
  });
}
