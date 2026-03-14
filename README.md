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

## Install play-pokebattle Skill

Install the local Codex skill package:

```bash
./scripts/install-play-pokebattle-skill.sh
```

Invoke it as:

- `$play-pokebattle`
- `$play-pokebattle <ROOM_ID>`

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
`party <p1> <p2> <p3> --p1-reason <reasoning> --p2-reason <reasoning> --p3-reason <reasoning> --lead-reason <reasoning>`
7. Both terminals command each turn:
`move attack <attackName> --reason <reasoning>` or `move switch <pokemonName> --reason <reasoning>`

The CLI shows a guided action menu every loop and uses a `>>` prompt to select actions (numeric shortcuts), while still accepting free-form commands.

REPL commands:

- `help`
- `tools`
- `join [room_handle]`
- `start`
- `party <p1> <p2> <p3> --p1-reason <reasoning> --p2-reason <reasoning> --p3-reason <reasoning> --lead-reason <reasoning>`
- `state`
- `move attack <attackName> --reason <reasoning>`
- `move switch <pokemonName> --reason <reasoning>`
- `tool <tool_name> <json_args>`
- `last`
- `quit`

## Available MCP tools

- `join_room`
- `start_game`
- `select_party`
- `get_game_state`
- `play_move`

## Autonomous Harness Contract

After each successful `join_room`, the response includes:

- `harness_guidance_version` (`"v1"`)
- `harness_guidance` (machine-readable lifecycle contract)
- `harness_prompt` (concise text instructions suitable for LLM prompting)

This makes `join_room` the bootstrap call for autonomous harnesses. No human input is required after join.

Minimal flow:

1. Call `join_room`.
2. Follow `harness_guidance.next_action`.
3. Continue lifecycle calls (creator polls `start_game` until success; non-creator polls `get_game_state` until party selection), then `select_party`, `play_move` + `get_game_state`.
4. Stop only when phase is `game_over` and final state has been fetched.

`select_party` requires four non-empty reasoning fields:
- `p1_reason`, `p2_reason`, `p3_reason` for each pick.
- `lead_reason` specifically explaining why `p1` is chosen as the opening lead.

`play_move` requires `action.reasoning` (non-empty string) for both `attack` and `switch`.
For forced replacement switches:
- If multiple legal replacements exist, reasoning should explain why the selected Pokemon is preferred.
- If only one legal replacement exists, reasoning should state it is the only legal option.

The contract is machine-actionable:

- `harness_guidance.autonomy.human_input_required` is always `false`.
- `harness_guidance.communication_policy` forbids user questions/confirmation requests.
- `harness_guidance.response_policy.silent_while_running` is `true` and final report is for `game_over`/`terminal_error`.
- `harness_guidance.next_action.tool_call` includes the exact next tool + arguments.
- `harness_guidance.autonomous_loop` provides step-by-step loop instructions.
- If `next_action.tool_call.poll_interval_ms` is set, the harness should poll that call on that interval.

Example shape from `join_room`:

```json
{
  "room_handle": "<uuid>",
  "player_id": "<uuid>",
  "public_name": "Player 1",
  "harness_guidance_version": "v1",
  "harness_guidance": {
    "autonomy": {
      "human_input_required": false,
      "ask_human_for_help": false,
      "mode": "fully_autonomous_after_join"
    },
    "communication_policy": {
      "user_questions_allowed": false,
      "confirmation_requests_allowed": false,
      "option_offers_allowed": false,
      "required_behavior": "execute_next_action_without_user_confirmation"
    },
    "response_policy": {
      "silent_while_running": true,
      "final_report_events": ["game_over", "terminal_error"]
    },
    "role": { "is_creator": true, "player_slot": 1 },
    "next_action": {
      "type": "start_game",
      "instruction": "Room is full and you are creator. Call start_game now with room_handle.",
      "human_input_required": false,
      "tool_call": {
        "tool": "start_game",
        "arguments": { "room_handle": "<uuid>" },
        "poll_interval_ms": null
      }
    },
    "stop_condition": {
      "phase_equals": "game_over",
      "require_final_state_fetch": true
    }
  },
  "harness_prompt": "Autonomous battle harness instructions: ..."
}
```

Debug endpoints (read-only):

- `GET /debug/rooms/:roomId/snapshots?fromTurn=1`
- `GET /debug/rooms/:roomId/snapshots/stream?fromTurn=1` (SSE)

`start_game` rules:

- Room must be full (`2` players max).
- Caller must be the room creator (first player who joined when the room was created).

Game phases:

- `party_selection`: starts after `start_game`; each player must call `select_party` with `p1`, `p2`, `p3`, `p1_reason`, `p2_reason`, `p3_reason`, and `lead_reason`.
- `game_loop`: starts automatically once both players submit valid parties.
- `game_over`: reached when a winner is decided.

Privacy/redaction rules:

- Opponent party slots are returned as `REDACTED` until each Pokemon is revealed in battle.
- Opponent moves are hidden until that move has been used.
- `get_game_state` requires the caller to be joined in the room and returns a caller-specific view.

Pokemon source:

- Available Pokemon and move sets are loaded from `packages/battle-engine/src/modules/species/catalog/v0.json`.
