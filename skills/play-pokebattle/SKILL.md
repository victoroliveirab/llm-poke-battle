---
name: play-pokebattle
description: "Start or join an autonomous Poke Battle match with a single invocation: '$play-pokebattle' or '$play-pokebattle <ROOM_ID>'. Use MCP tools join_room/start_game/select_party/get_game_state/play_move to run until game_over without asking for additional user input."
---

# Play Poke Battle

Execute this workflow when the user invokes:

- `$play-pokebattle`
- `$play-pokebattle <ROOM_ID>`

## Inputs

- Optional `room_handle` (from `$play-pokebattle <ROOM_ID>`)

If `room_handle` is missing:

- Call `join_room` with no args to create a room and join as Player 1.

If `room_handle` is provided:

- Call `join_room({"room_handle":"<ROOM_ID>"})`.

## Parse Contract (join_room JSON payload)

`join_room` returns JSON in `content[0].text`. Parse:

- `room_handle`
- `player_id`
- `public_name`
- `created_room`
- `harness_guidance.next_action.type`
- `harness_guidance.next_action.tool_call`
- `harness_guidance.autonomy.human_input_required`
- `harness_guidance.response_policy.silent_while_running`
- `harness_guidance.autonomous_loop`

## Workflow

1. Bootstrap:
- Call `join_room` (with or without `room_handle`).
- Parse `room_handle`, `player_id`, `public_name`.
- Print exactly one bootstrap line:
`Battle bootstrap: room=<room_handle> player=<public_name> player_id=<player_id>`

2. Pre-start loop:
- Do not call `join_room` again.
- If you are creator, poll `start_game({"room_handle":"<room_handle>"})` every 1000ms until success.
- If you are not creator, poll `get_game_state({"room_handle":"<room_handle>"})` every 1000ms until you should pick a party.
- Do not ask for user input.

3. Party selection:
- Call `get_game_state({"room_handle":"<room_handle>"})`.
- If phase is `party_selection` and your party is not selected:
  - Read `availablePokemon` and `requiredPartySize`.
  - Choose the first `requiredPartySize` distinct names from `availablePokemon`.
  - Call `select_party({"room_handle":"<room_handle>","p1":"...","p2":"...","p3":"..."})`.
- If your party is already selected, keep polling `get_game_state` every 1000ms.

4. Game loop:
- Poll `get_game_state({"room_handle":"<room_handle>"})`.
- If phase is `game_over`, report winner and stop.
- If phase is `game_loop`, choose one action and call `play_move`.

Action policy:
- Prefer `attack` with the first available move from your active Pokemon.
- If attack fails due to forced replacement or invalid attack, choose `switch` to the first alive bench Pokemon.
- On `Action already taken`, `Game not started yet`, or waiting errors, continue polling.

5. Stop condition:
- Stop only when `phase == game_over`.
- Print one final line:
`Battle result: room=<room_handle> winner=<winner_or_unknown>`

## Behavior Constraints

- Do not ask turn-by-turn confirmation.
- Do not ask the user to share room handles after loop starts.
- Keep output concise: bootstrap line, short move logs, final result.
