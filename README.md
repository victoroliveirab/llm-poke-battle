# MCP Poke Battle (Bun)

Bun + TypeScript workspace with two packages:

- `@poke-battle/battle-engine`: simple turn-based battle engine
- `@poke-battle/mcp-server`: MCP server exposing tools for LLMs

## What This Project Is For

This project is intended to run autonomous Pokemon battles between two different LLMs through MCP tools.

Each LLM acts as a player and uses the exposed MCP tools (`join_room`, `start_game`, `select_party`, `get_game_state`, `play_move`) to make decisions and play turns.

The intended human involvement is minimal: only create a room (or provide an existing room handle) so each harness can join. After that, the battle flow should be driven by the two LLM harnesses.

## Requirements

- Bun `>=1.1`

## Install

```bash
bun install
```

## Run MCP server (Streamable HTTP)

```bash
bun run dev
```

The server listens on:

- MCP endpoint: `http://127.0.0.1:6969/mcp`
- Health check: `http://127.0.0.1:6969/health`

## Add to Codex CLI

```bash
codex mcp add poke-battle --url http://127.0.0.1:6969/mcp
```

## Turn Snapshot CLI

Print full board snapshots for a room as turns resolve:

```bash
bun run room-snapshots -- <ROOM_ID>
```

Options:

- `--from-turn <n>` start from a specific turn (default: `1`)
- `--once` print available snapshots once and exit
- `--poll-ms <n>` polling interval fallback in milliseconds (default: `1000`)
- `--server <url>` server base URL (default: `http://127.0.0.1:6969`)

## Manual MCP Player CLI

Run an interactive MCP client as one human-controlled player:

```bash
bun run mcp-player -- [options]
```

Options:

- `--server <url>` MCP endpoint URL (default: `http://127.0.0.1:6969/mcp`)
- `--room <id>` join an existing room on startup
- `--name <label>` local prompt label

One CLI process equals one MCP session/player. To run a full match without LLMs, use two terminals:

1. Terminal A:
`bun run mcp-player -- --name p1`
2. Terminal A command:
`join`
3. Copy `room_handle` from output.
4. Terminal B:
`bun run mcp-player -- --name p2 --room <room_handle>`
5. Terminal A command:
`start`
6. Both terminals command:
`party <p1> <p2> <p3>`
7. Both terminals command each turn:
`move attack <attackName>` or `move switch <pokemonName>`

The CLI shows a guided action menu every loop and uses a `>>` prompt to select actions (numeric shortcuts), while still accepting free-form commands.

REPL commands:

- `help`
- `tools`
- `join [room_handle]`
- `start`
- `party <p1> <p2> <p3>`
- `state`
- `move attack <attackName>`
- `move switch <pokemonName>`
- `tool <tool_name> <json_args>`
- `last`
- `quit`

## Available MCP tools

- `join_room`
- `start_game`
- `select_party`
- `get_game_state`
- `play_move`

Debug endpoints (read-only):

- `GET /debug/rooms/:roomId/snapshots?fromTurn=1`
- `GET /debug/rooms/:roomId/snapshots/stream?fromTurn=1` (SSE)

`start_game` rules:

- Room must be full (`2` players max).
- Caller must be the room creator (first player who joined when the room was created).

Game phases:

- `party_selection`: starts after `start_game`; each player must call `select_party` with `p1`, `p2`, `p3`.
- `game_loop`: starts automatically once both players submit valid parties.
- `game_over`: reached when a winner is decided.

Privacy/redaction rules:

- Opponent party slots are returned as `REDACTED` until each Pokemon is revealed in battle.
- Opponent moves are hidden until that move has been used.
- `get_game_state` requires the caller to be joined in the room and returns a caller-specific view.

Pokemon source:

- Available Pokemon and move sets are loaded from `packages/battle-engine/src/modules/species/catalog/v0.json`.
