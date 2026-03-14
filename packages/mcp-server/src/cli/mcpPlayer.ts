import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';

type CliOptions = {
  server: string;
  roomHandle: string | null;
  name: string | null;
};

type McpClient = {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
};

type LastResult =
  | {
      type: 'tool';
      toolName: string;
      args: Record<string, unknown>;
      elapsedMs: number;
      isError: boolean;
      parsedJson: unknown | null;
      textContent: string[];
    }
  | {
      type: 'error';
      message: string;
    };

const STARTUP_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 15000;
const MCP_PROTOCOL_VERSION = '2025-11-25';

const HELP_TEXT = `Usage:
  bun run mcp-player -- [options]

Options:
  --server <url>    MCP endpoint URL (default: http://127.0.0.1:6969/mcp)
  --room <id>       Join this room on startup
  --name <label>    Local prompt label shown in CLI
  -h, --help        Show this help message

Commands:
  (Interactive menu uses numeric shortcuts with ">>" prompt)
  help
  tools
  join [room_handle]
  start
  party <p1> <p2> <p3> --p1-reason <reasoning> --p2-reason <reasoning> --p3-reason <reasoning> --lead-reason <reasoning>
  state
  move attack <attackName> --reason <reasoning>
  move switch <pokemonName> --reason <reasoning>
  tool <tool_name> <json_args>
  last
  quit
`;

const PARTY_USAGE =
  'Usage: party <p1> <p2> <p3> --p1-reason <reasoning> --p2-reason <reasoning> --p3-reason <reasoning> --lead-reason <reasoning>';

class HttpMcpClient implements McpClient {
  private readonly endpoint: string;
  private sessionId: string | null = null;
  private nextRequestId = 1;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async connect() {
    await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'mcp-manual-player',
        version: '0.1.0',
      },
    });

    await this.notify('notifications/initialized');
  }

  async close() {
    // No explicit close required for this lightweight HTTP JSON-RPC client.
  }

  async listTools(): Promise<{ tools: Array<{ name: string }> }> {
    const result = await this.request('tools/list', {});
    if (!isRecord(result) || !Array.isArray(result.tools)) {
      throw new Error('Invalid tools/list response payload.');
    }

    return {
      tools: result.tools
        .filter(isRecord)
        .map((entry) => ({
          name: typeof entry.name === 'string' ? entry.name : 'unknown',
        })),
    };
  }

  async callTool(params: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request('tools/call', params);
  }

  private async request(method: string, params: unknown) {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    const json = await this.sendJsonRpc(payload, true);
    if (!isRecord(json)) {
      throw new Error(`Invalid JSON-RPC response for method '${method}'.`);
    }

    if (isRecord(json.error)) {
      const code =
        typeof json.error.code === 'number' ? String(json.error.code) : '?';
      const message =
        typeof json.error.message === 'string'
          ? json.error.message
          : 'Unknown error';
      throw new Error(`MCP error ${code}: ${message}`);
    }

    if (!('result' in json)) {
      throw new Error(`Missing result for method '${method}'.`);
    }

    return json.result;
  }

  private async notify(method: string) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params: {},
    };

    await this.sendJsonRpc(payload, false);
  }

  private async sendJsonRpc(payload: unknown, expectJsonBody: boolean) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseSessionId = response.headers.get('mcp-session-id');
      if (responseSessionId) {
        this.sessionId = responseSessionId;
      }

      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} from MCP endpoint: ${truncate(text, 500)}`,
        );
      }

      if (!expectJsonBody) {
        if (text.trim() === '') {
          return null;
        }

        if (
          (response.headers.get('content-type') ?? '').includes(
            'text/event-stream',
          )
        ) {
          return parseFirstSseJsonPayload(text);
        }

        return JSON.parse(text);
      }

      if (text.trim() === '') {
        throw new Error('Empty JSON-RPC response body.');
      }

      if (
        (response.headers.get('content-type') ?? '').includes(
          'text/event-stream',
        )
      ) {
        return parseFirstSseJsonPayload(text);
      }

      return JSON.parse(text);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `HTTP request to MCP endpoint timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  if (!options) {
    console.log(HELP_TEXT.trimEnd());
    return;
  }

  const client: McpClient = new HttpMcpClient(options.server);

  console.log(`Connecting to MCP server: ${options.server}`);
  try {
    await withTimeout(
      client.connect(),
      STARTUP_TIMEOUT_MS,
      'MCP initialize/connect',
    );
  } catch (error) {
    await printConnectionErrorHints(options.server, error);
    throw error;
  }

  let currentRoomHandle = options.roomHandle;
  let lastResult: LastResult | null = null;

  console.log(`Connected to MCP server: ${options.server}`);
  console.log('Interactive mode enabled. Use the menu or type commands directly.');

  try {
    const toolResult = await withTimeout(
      client.listTools(),
      STARTUP_TIMEOUT_MS,
      'list tools',
    );
    const names = toolResult.tools.map((tool) => tool.name).sort();
    console.log(`Available tools: ${names.join(', ')}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown listTools error';
    console.error(`Failed to list tools: ${message}`);
  }

  if (currentRoomHandle) {
    const startupResult = await invokeTool(client, 'join_room', {
      room_handle: currentRoomHandle,
    });
    lastResult = startupResult;
    printToolResult(startupResult);
    const roomFromJoin = getRoomHandleFromPayload(startupResult.parsedJson);
    if (roomFromJoin) {
      currentRoomHandle = roomFromJoin;
    }
  }

  const rl = readline.createInterface({
    input,
    output,
    terminal: true,
  });

  try {
    while (true) {
      printSessionStatus(options.name, currentRoomHandle);
      printActionMenu();

      const rawLine = (await rl.question('>> ')).trim();
      const line = normalizeInputLine(rawLine);

      if (line.length === 0) {
        continue;
      }

      if (line === '0' || line === 'quit' || line === 'exit') {
        break;
      }

      if (line === 'h' || line === 'help') {
        console.log(HELP_TEXT.trimEnd());
        continue;
      }

      if (line === '9' || line === 'tools') {
        try {
          const toolResult = await client.listTools();
          const names = toolResult.tools.map((tool) => tool.name).sort();
          console.log(names.join('\n'));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown listTools error';
          console.error(`Failed to list tools: ${message}`);
        }
        continue;
      }

      if (line === '10' || line === 'last') {
        printLastResult(lastResult);
        continue;
      }

      let commandLine = line;
      if (line === '1') {
        commandLine = 'join';
      } else if (line === '2') {
        const roomHandle = await promptRequired(rl, 'Room handle to join: ');
        commandLine = `join ${roomHandle}`;
      } else if (line === '3') {
        commandLine = 'start';
      } else if (line === '4') {
        const p1 = await promptRequired(rl, 'Party slot 1: ');
        const p1Reason = await promptRequired(rl, 'Party slot 1 reasoning: ');
        const p2 = await promptRequired(rl, 'Party slot 2: ');
        const p2Reason = await promptRequired(rl, 'Party slot 2 reasoning: ');
        const p3 = await promptRequired(rl, 'Party slot 3: ');
        const p3Reason = await promptRequired(rl, 'Party slot 3 reasoning: ');
        const leadReason = await promptRequired(
          rl,
          'Lead reasoning (why slot 1 opens): ',
        );
        commandLine = `party ${p1} ${p2} ${p3} --p1-reason ${p1Reason} --p2-reason ${p2Reason} --p3-reason ${p3Reason} --lead-reason ${leadReason}`;
      } else if (line === '5') {
        commandLine = 'state';
      } else if (line === '6') {
        const attackName = await promptRequired(rl, 'Attack name: ');
        const reasoning = await promptRequired(rl, 'Reasoning: ');
        commandLine = `move attack ${attackName} --reason ${reasoning}`;
      } else if (line === '7') {
        const pokemonName = await promptRequired(rl, 'Pokemon to switch to: ');
        const reasoning = await promptRequired(rl, 'Reasoning: ');
        commandLine = `move switch ${pokemonName} --reason ${reasoning}`;
      } else if (line === '8') {
        const toolName = await promptRequired(rl, 'Tool name: ');
        const rawArgs = await promptRequired(rl, 'Tool JSON args (object): ');
        commandLine = `tool ${toolName} ${rawArgs}`;
      }

      try {
        const commandResult = await runCommand({
          line: commandLine,
          client,
          currentRoomHandle,
        });
        currentRoomHandle = commandResult.nextRoomHandle;
        lastResult = commandResult.lastResult;
        printToolResult(commandResult.lastResult);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected command error';
        lastResult = { type: 'error', message };
        console.error(message);
      }
    }
  } finally {
    rl.close();
    await client.close();
  }
}

async function runCommand(params: {
  line: string;
  client: McpClient;
  currentRoomHandle: string | null;
}): Promise<{ nextRoomHandle: string | null; lastResult: LastResult }> {
  const { line, client, currentRoomHandle } = params;
  const tokens = line.split(/\s+/);
  const command = tokens[0];

  if (command === 'join') {
    const explicitRoom = tokens[1] ?? null;
    if (tokens.length > 2) {
      throw new Error('Usage: join [room_handle]');
    }

    const args = explicitRoom ? { room_handle: explicitRoom } : {};
    const result = await invokeTool(client, 'join_room', args);
    const joinedRoom = getRoomHandleFromPayload(result.parsedJson);
    return {
      nextRoomHandle: joinedRoom ?? explicitRoom ?? currentRoomHandle,
      lastResult: result,
    };
  }

  if (command === 'start') {
    const roomHandle = assertRoomHandle(currentRoomHandle);
    const result = await invokeTool(client, 'start_game', {
      room_handle: roomHandle,
    });
    return { nextRoomHandle: roomHandle, lastResult: result };
  }

  if (command === 'party') {
    const parsedParty = parsePartyCommand(tokens);
    const roomHandle = assertRoomHandle(currentRoomHandle);
    const result = await invokeTool(client, 'select_party', {
      room_handle: roomHandle,
      p1: parsedParty.p1,
      p2: parsedParty.p2,
      p3: parsedParty.p3,
      p1_reason: parsedParty.p1Reason,
      p2_reason: parsedParty.p2Reason,
      p3_reason: parsedParty.p3Reason,
      lead_reason: parsedParty.leadReason,
    });
    return { nextRoomHandle: roomHandle, lastResult: result };
  }

  if (command === 'state') {
    const roomHandle = assertRoomHandle(currentRoomHandle);
    const result = await invokeTool(client, 'get_game_state', {
      room_handle: roomHandle,
    });
    return { nextRoomHandle: roomHandle, lastResult: result };
  }

  if (command === 'move') {
    if (tokens.length < 5) {
      throw new Error(
        'Usage: move attack <attackName> --reason <reasoning> | move switch <pokemonName> --reason <reasoning>',
      );
    }

    const roomHandle = assertRoomHandle(currentRoomHandle);
    const mode = tokens[1];
    const reasonFlagIndex = tokens.findIndex((token) => token === '--reason');
    if (reasonFlagIndex < 0 || reasonFlagIndex === tokens.length - 1) {
      throw new Error(
        'Usage: move attack <attackName> --reason <reasoning> | move switch <pokemonName> --reason <reasoning>',
      );
    }
    const payloadValue = tokens.slice(2, reasonFlagIndex).join(' ');
    const reasoning = tokens.slice(reasonFlagIndex + 1).join(' ');
    if (!payloadValue || !reasoning) {
      throw new Error(
        'Usage: move attack <attackName> --reason <reasoning> | move switch <pokemonName> --reason <reasoning>',
      );
    }

    if (mode === 'attack') {
      const result = await invokeTool(client, 'play_move', {
        room_handle: roomHandle,
        action: {
          type: 'attack',
          reasoning,
          payload: {
            attackName: payloadValue,
          },
        },
      });
      return { nextRoomHandle: roomHandle, lastResult: result };
    }

    if (mode === 'switch') {
      const result = await invokeTool(client, 'play_move', {
        room_handle: roomHandle,
        action: {
          type: 'switch',
          reasoning,
          payload: {
            newPokemon: payloadValue,
          },
        },
      });
      return { nextRoomHandle: roomHandle, lastResult: result };
    }

    throw new Error(
      'Usage: move attack <attackName> --reason <reasoning> | move switch <pokemonName> --reason <reasoning>',
    );
  }

  if (command === 'tool') {
    const parsed = parseRawToolCommand(line);
    const result = await invokeTool(client, parsed.toolName, parsed.args);
    const roomFromTool = getRoomHandleFromPayload(result.parsedJson);
    return {
      nextRoomHandle: roomFromTool ?? currentRoomHandle,
      lastResult: result,
    };
  }

  throw new Error(`Unknown command '${command}'. Type 'help' for usage.`);
}

function parseArgs(argv: string[]): CliOptions | null {
  if (argv.includes('--help') || argv.includes('-h')) {
    return null;
  }

  let server = 'http://127.0.0.1:6969/mcp';
  let roomHandle: string | null = null;
  let name: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) {
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

    if (current === '--room') {
      const value = argv[i + 1];
      i += 1;
      if (!value) {
        throw new Error('Missing value for --room.');
      }
      roomHandle = value;
      continue;
    }

    if (current === '--name') {
      const value = argv[i + 1];
      i += 1;
      if (!value) {
        throw new Error('Missing value for --name.');
      }
      name = value;
      continue;
    }

    throw new Error(`Unknown option '${current}'.`);
  }

  return {
    server,
    roomHandle,
    name,
  };
}

function parsePartyCommand(tokens: string[]): {
  p1: string;
  p2: string;
  p3: string;
  p1Reason: string;
  p2Reason: string;
  p3Reason: string;
  leadReason: string;
} {
  if (tokens.length < 4) {
    throw new Error(PARTY_USAGE);
  }

  const p1 = tokens[1];
  const p2 = tokens[2];
  const p3 = tokens[3];
  if (!p1 || !p2 || !p3) {
    throw new Error(PARTY_USAGE);
  }

  const requiredFlags = [
    '--p1-reason',
    '--p2-reason',
    '--p3-reason',
    '--lead-reason',
  ] as const;
  const flagIndexes = new Map<string, number>();
  for (const flag of requiredFlags) {
    const index = tokens.findIndex((token) => token === flag);
    if (index < 4) {
      throw new Error(PARTY_USAGE);
    }
    flagIndexes.set(flag, index);
  }

  const sortedFlags = [...requiredFlags].sort(
    (left, right) =>
      (flagIndexes.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (flagIndexes.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  const firstFlagIndex = flagIndexes.get(sortedFlags[0] ?? '') ?? -1;
  if (firstFlagIndex !== 4) {
    throw new Error(PARTY_USAGE);
  }

  const valueByFlag = new Map<string, string>();
  for (let i = 0; i < sortedFlags.length; i += 1) {
    const flag = sortedFlags[i];
    if (!flag) {
      continue;
    }

    const start = (flagIndexes.get(flag) ?? -1) + 1;
    const nextFlag = sortedFlags[i + 1];
    const end =
      nextFlag && flagIndexes.has(nextFlag)
        ? (flagIndexes.get(nextFlag) ?? tokens.length)
        : tokens.length;
    const value = tokens.slice(start, end).join(' ').trim();
    if (value.length === 0) {
      throw new Error(PARTY_USAGE);
    }
    valueByFlag.set(flag, value);
  }

  const p1Reason = valueByFlag.get('--p1-reason');
  const p2Reason = valueByFlag.get('--p2-reason');
  const p3Reason = valueByFlag.get('--p3-reason');
  const leadReason = valueByFlag.get('--lead-reason');
  if (!p1Reason || !p2Reason || !p3Reason || !leadReason) {
    throw new Error(PARTY_USAGE);
  }

  return {
    p1,
    p2,
    p3,
    p1Reason,
    p2Reason,
    p3Reason,
    leadReason,
  };
}

function normalizeInputLine(line: string): string {
  if (!line.startsWith('/')) {
    return line;
  }

  // Support slash-prefixed command aliases (e.g. /join, /start).
  return line.slice(1).trimStart();
}

async function promptRequired(
  rl: readline.Interface,
  label: string,
): Promise<string> {
  while (true) {
    const value = (await rl.question(label)).trim();
    if (value.length > 0) {
      return value;
    }
    console.log('Value is required.');
  }
}

function printSessionStatus(label: string | null, roomHandle: string | null) {
  const name = label ?? 'player';
  const room = roomHandle ?? 'none';
  console.log(`\nPlayer=${name} Room=${room}`);
}

function printActionMenu() {
  console.log('Choose an action:');
  console.log('  1) join/create room');
  console.log('  2) join specific room');
  console.log('  3) start game');
  console.log('  4) select party + reasoning');
  console.log('  5) get game state');
  console.log('  6) attack move');
  console.log('  7) switch pokemon');
  console.log('  8) raw tool call');
  console.log('  9) list tools');
  console.log(' 10) show last result');
  console.log('  0) quit');
  console.log('  You can also type any command directly (e.g. "join", "/state").');
}

async function invokeTool(
  client: McpClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Extract<LastResult, { type: 'tool' }>> {
  const startedAt = Date.now();
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  const elapsedMs = Date.now() - startedAt;
  const textContent = extractTextContent(result);
  const parsedJson = parsePrimaryJson(textContent);
  const isError = isToolError(result);

  return {
    type: 'tool',
    toolName,
    args,
    elapsedMs,
    isError,
    parsedJson,
    textContent,
  };
}

function isToolError(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return value.isError === true;
}

function extractTextContent(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const maybeContent = value.content;
  if (!Array.isArray(maybeContent)) {
    return [];
  }

  const textEntries: string[] = [];
  for (const entry of maybeContent) {
    if (!isRecord(entry)) {
      continue;
    }

    if (entry.type !== 'text') {
      continue;
    }

    if (typeof entry.text === 'string') {
      textEntries.push(entry.text);
    }
  }

  return textEntries;
}

function parsePrimaryJson(textEntries: string[]): unknown | null {
  if (textEntries.length === 0) {
    return null;
  }

  const first = textEntries[0];
  if (!first) {
    return null;
  }

  try {
    return JSON.parse(first);
  } catch {
    return null;
  }
}

function printToolResult(result: LastResult) {
  if (result.type === 'error') {
    console.error(`[error] ${result.message}`);
    return;
  }

  const status = result.isError ? 'error' : 'ok';
  console.log(`[${status}] tool=${result.toolName} elapsed_ms=${result.elapsedMs}`);
  console.log(`args=${JSON.stringify(result.args)}`);

  const battleState = extractBattleState(result.parsedJson);
  if (battleState) {
    printBattleSummary(battleState);
  }

  if (result.parsedJson !== null) {
    console.log(JSON.stringify(result.parsedJson, null, 2));
    return;
  }

  if (result.textContent.length > 0) {
    for (const line of result.textContent) {
      console.log(line);
    }
    return;
  }

  console.log('(no text content returned)');
}

function printLastResult(lastResult: LastResult | null) {
  if (!lastResult) {
    console.log('No prior command output.');
    return;
  }

  printToolResult(lastResult);
}

function extractBattleState(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (isBattleState(payload)) {
    return payload;
  }

  const nested = payload.state;
  if (isRecord(nested) && isBattleState(nested)) {
    return nested;
  }

  return null;
}

function isBattleState(value: Record<string, unknown>): boolean {
  return typeof value.phase === 'string' && typeof value.turn === 'number';
}

function printBattleSummary(state: Record<string, unknown>) {
  const phase = asStringOrFallback(state.phase, 'unknown');
  const turn = typeof state.turn === 'number' ? String(state.turn) : '?';
  const winner = asStringOrFallback(state.winner, 'none');

  console.log(`phase=${phase} turn=${turn} winner=${winner}`);

  const playerActive = getActivePokemonSummary(state.player);
  const opponentActive = getActivePokemonSummary(state.opponent);

  if (playerActive) {
    console.log(`you=${playerActive.name} hp=${playerActive.hp}`);
  }

  if (opponentActive) {
    console.log(`opponent=${opponentActive.name} hp=${opponentActive.hp}`);
  }
}

function getActivePokemonSummary(value: unknown): { name: string; hp: string } | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const first = value[0];
  if (!isRecord(first)) {
    return null;
  }

  const name = asStringOrFallback(first.name, 'unknown');
  const hp = formatHealth(first.health);
  return { name, hp };
}

function formatHealth(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (value === null) {
    return 'hidden';
  }

  return '?';
}

function asStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function getRoomHandleFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const roomHandle = payload.room_handle;
  if (typeof roomHandle !== 'string' || roomHandle.length === 0) {
    return null;
  }

  return roomHandle;
}

function assertRoomHandle(roomHandle: string | null): string {
  if (!roomHandle) {
    throw new Error(
      "No room selected. Use 'join' first or start the CLI with --room <id>.",
    );
  }
  return roomHandle;
}

function parseRawToolCommand(line: string): {
  toolName: string;
  args: Record<string, unknown>;
} {
  const commandBody = line.slice('tool'.length).trimStart();
  if (commandBody.length === 0) {
    throw new Error('Usage: tool <tool_name> <json_args>');
  }

  const firstWhitespace = commandBody.search(/\s/);
  if (firstWhitespace === -1) {
    return {
      toolName: commandBody,
      args: {},
    };
  }

  const toolName = commandBody.slice(0, firstWhitespace);
  const rawArgs = commandBody.slice(firstWhitespace).trim();
  if (!rawArgs) {
    return {
      toolName,
      args: {},
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`Invalid JSON for tool arguments: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('Tool arguments must be a JSON object.');
  }

  return {
    toolName,
    args: parsed,
  };
}

async function printConnectionErrorHints(serverUrl: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    !message.includes('Request timed out') &&
    !message.includes('timed out after')
  ) {
    return;
  }

  console.error(`Connection to '${serverUrl}' timed out.`);
  console.error('Troubleshooting:');
  console.error('1) Start the MCP server in another terminal: bun run dev');
  console.error('2) Check health endpoint: curl http://127.0.0.1:6969/health');
  console.error(
    '3) If port 6969 is occupied by a stale process, stop it and restart server.',
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

function parseFirstSseJsonPayload(raw: string): unknown {
  const lines = raw.split(/\r?\n/);
  let dataLines: string[] = [];

  const parseCurrentEvent = (): unknown | null => {
    if (dataLines.length === 0) {
      return null;
    }

    const payloadText = dataLines.join('\n').trim();
    dataLines = [];
    if (payloadText.length === 0) {
      return null;
    }

    return JSON.parse(payloadText);
  };

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
      continue;
    }

    if (line.trim() === '') {
      const parsed = parseCurrentEvent();
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  const parsed = parseCurrentEvent();
  if (parsed !== null) {
    return parsed;
  }

  throw new Error('SSE response did not contain a JSON data payload.');
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(message);
  process.exit(1);
});
