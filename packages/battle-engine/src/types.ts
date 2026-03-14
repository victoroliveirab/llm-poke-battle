import { z } from 'zod';

const baseActionEnvelopeSchema = z.object({
  playerID: z.string().min(1, 'playerID is required'),
  type: z.string().min(1, 'type is required'),
  payload: z.unknown(),
});

export type ActionEnvelope = z.infer<typeof baseActionEnvelopeSchema>;

export const attackPayloadSchema = z.object({
  attackName: z.string().min(1, 'attackName is required'),
});

export const switchPayloadSchema = z.object({
  newPokemon: z.string().min(1, 'newPokemon is required'),
});

export type ActionAttack = {
  playerID: string;
  type: 'attack';
  payload: z.infer<typeof attackPayloadSchema>;
};

export type ActionSwitch = {
  playerID: string;
  type: 'switch';
  payload: z.infer<typeof switchPayloadSchema>;
};

export type Action = ActionAttack | ActionSwitch;

export function parseAction(input: unknown): Action {
  const base = baseActionEnvelopeSchema.parse(input);

  if (base.type === 'attack') {
    return {
      playerID: base.playerID,
      type: 'attack',
      payload: attackPayloadSchema.parse(base.payload),
    };
  }

  if (base.type === 'switch') {
    return {
      playerID: base.playerID,
      type: 'switch',
      payload: switchPayloadSchema.parse(base.payload),
    };
  }

  throw new Error(`Unknown action type '${base.type}'.`);
}
