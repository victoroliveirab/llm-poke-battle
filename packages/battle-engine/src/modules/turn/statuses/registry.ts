import { burnStatusHandler } from './burn';
import { confusionStatusHandler } from './confusion';
import { freezeStatusHandler } from './freeze';
import { paralysisStatusHandler } from './paralysis';
import { poisonStatusHandler } from './poison';
import { sleepStatusHandler } from './sleep';
import { StatusHandlerRegistry } from './types';

export const defaultStatusHandlerRegistry = {
  burn: burnStatusHandler,
  confusion: confusionStatusHandler,
  freeze: freezeStatusHandler,
  paralysis: paralysisStatusHandler,
  poison: poisonStatusHandler,
  sleep: sleepStatusHandler,
} satisfies StatusHandlerRegistry;
