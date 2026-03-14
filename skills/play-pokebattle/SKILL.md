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
  - Assume both players draft from the same `availablePokemon` pool, but move sets can differ by player.
  - Pick `requiredPartySize` distinct names that support a coherent strategy, not list order.
  - Build for coverage: include answers for likely opposing picks and avoid a party that loses to one common counter-profile.
  - Infer likely opponent picks from generally strong/flexible options in the pool and draft to pressure those picks.
  - Call `select_party({"room_handle":"<room_handle>","p1":"...","p2":"...","p3":"...","p1_reason":"<why pick 1>","p2_reason":"<why pick 2>","p3_reason":"<why pick 3>","lead_reason":"<why p1 should lead>"})`.
  - In each `p*_reason`, explain both strategic role and what expected opponent choices this pick covers.
  - `lead_reason` must give extra depth because `p1` opens the battle.
- If your party is already selected, keep polling `get_game_state` every 1000ms.

4. Game loop:

- Poll `get_game_state({"room_handle":"<room_handle>"})`.
- If phase is `game_over`, report winner and stop.
- If phase is `game_loop`, choose one action and call `play_move`.
- Every `play_move` call must include `action.reasoning` (free text) explaining why the action was chosen.

Action policy:

- Do not default to always attacking. Decide between `attack` and `switch` based on matchup quality, expected damage trade, and win path.
- Evaluate current matchup before each move:
  - expected incoming damage if you stay in
  - expected outgoing damage if you attack now
  - whether a switch creates a clearly better position next turn
- Build and update a lightweight opponent model from observed behavior (move choices, switch frequency, risk tolerance) and use it to inform decisions.
- Example tendencies to reason about (not hard rules):
  - Opponent always attacks: this may be punishable by switching into favorable resistances/immunities.
  - Opponent over-switches for ideal matchups: this may be punishable with chip pressure and consistent safe damage.
  - Opponent makes low-risk repetitive plays: this may be exploitable by proactive positioning.
- Come up with your own strategy from the evolving board state; use these examples only as signals, not fixed instructions.
- If forced replacement, switch to the best available bench option for the current matchup (not just the first one).
- For forced replacement:
  - If more than one legal replacement exists, explain why the chosen Pokemon is better than alternatives.
  - If exactly one legal replacement exists, state that it is the only legal choice.
- If invalid attack occurs, read again the available attacks to decide the attack.
- On `Action already taken`, `Game not started yet`, or waiting errors, continue polling.

`play_move` payload shape examples:

- Attack:
  `{"room_handle":"<room_handle>","action":{"type":"attack","reasoning":"<why this attack now>","payload":{"attackName":"<AttackName>"}}}`
- Switch:
  `{"room_handle":"<room_handle>","action":{"type":"switch","reasoning":"<why this Pokemon is the best switch>","payload":{"newPokemon":"<PokemonName>"}}}`

5. Stop condition:

- Stop only when `phase == game_over`.
- Print one final line:
  `Battle result: room=<room_handle> winner=<winner_or_unknown>`

## Behavior Constraints

- Do not ask turn-by-turn confirmation.
- Do not ask the user to share room handles after loop starts.
- Keep output concise: bootstrap line, short move logs, final result.
