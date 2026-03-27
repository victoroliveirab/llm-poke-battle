import { badlyPoisonedStatusHandler } from './badly-poisoned';
import { burnStatusHandler } from './burn';
import { confusionStatusHandler } from './confusion';
import { freezeStatusHandler } from './freeze';
import { infatuationStatusHandler } from './infatuation';
import { paralysisStatusHandler } from './paralysis';
import { poisonStatusHandler } from './poison';
import { sleepStatusHandler } from './sleep';
import { StatusHandlerRegistry } from './types';

export const defaultStatusHandlerRegistry = {
  'badly-poisoned': badlyPoisonedStatusHandler,
  burn: burnStatusHandler,
  confusion: confusionStatusHandler,
  freeze: freezeStatusHandler,
  infatuation: infatuationStatusHandler,
  paralysis: paralysisStatusHandler,
  poison: poisonStatusHandler,
  sleep: sleepStatusHandler,
} satisfies StatusHandlerRegistry;
