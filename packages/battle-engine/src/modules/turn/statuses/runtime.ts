import { PartyEntry } from '../../party/party';
import { StatusKind } from '../status-state';
import {
  DamageContext,
  ModifyDamageResult,
  MoveStatusContext,
  StatusContext,
  StatusHandler,
  StatusHandlerRegistry,
} from './types';

export type StatusHandlerRegistration = {
  kind: StatusKind;
  handler: StatusHandler;
};

type RuntimeParams<TContext> = {
  context: TContext;
  pokemon: Pick<PartyEntry, 'majorStatus' | 'volatileStatuses'>;
  registry: StatusHandlerRegistry;
};

export function getStatusHandlers(
  pokemon: Pick<PartyEntry, 'majorStatus' | 'volatileStatuses'>,
  registry: StatusHandlerRegistry,
): StatusHandlerRegistration[] {
  const registrations: StatusHandlerRegistration[] = [];

  if (pokemon.majorStatus !== null) {
    const majorHandler = registry[pokemon.majorStatus];
    if (majorHandler) {
      registrations.push({
        kind: pokemon.majorStatus,
        handler: majorHandler,
      });
    }
  }

  for (const status of pokemon.volatileStatuses) {
    const handler = registry[status.kind];
    if (handler) {
      registrations.push({
        kind: status.kind,
        handler,
      });
    }
  }

  return registrations;
}

export function runBeforeMoveHooks(
  params: RuntimeParams<MoveStatusContext>,
): { canAct: boolean } {
  for (const { handler } of getStatusHandlers(params.pokemon, params.registry)) {
    const result = handler.beforeMove?.(params.context);
    if (result && !result.canAct) {
      return { canAct: false };
    }
  }

  return { canAct: true };
}

export function runModifyDamageHooks(
  params: RuntimeParams<MoveStatusContext> & {
    damage: number;
  },
): ModifyDamageResult {
  let damage = params.damage;

  for (const { handler } of getStatusHandlers(params.pokemon, params.registry)) {
    const result = handler.modifyDamage?.({
      ...params.context,
      damage,
    } satisfies DamageContext);

    if (result) {
      damage = result.damage;
    }
  }

  return { damage };
}

export function runAfterMoveHooks(params: RuntimeParams<MoveStatusContext>) {
  for (const { handler } of getStatusHandlers(params.pokemon, params.registry)) {
    handler.afterMove?.(params.context);
  }
}

export function runEndTurnHooks(params: RuntimeParams<StatusContext>) {
  for (const { handler } of getStatusHandlers(params.pokemon, params.registry)) {
    handler.endTurn?.(params.context);
  }
}
