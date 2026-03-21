import { burnStatusHandler } from './burn';
import { freezeStatusHandler } from './freeze';
import { paralysisStatusHandler } from './paralysis';
import { StatusHandlerRegistry } from './types';

export const defaultStatusHandlerRegistry = {
  burn: burnStatusHandler,
  freeze: freezeStatusHandler,
  paralysis: paralysisStatusHandler,
} satisfies StatusHandlerRegistry;
