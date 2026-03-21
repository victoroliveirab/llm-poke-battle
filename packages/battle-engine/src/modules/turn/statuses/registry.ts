import { burnStatusHandler } from './burn';
import { paralysisStatusHandler } from './paralysis';
import { StatusHandlerRegistry } from './types';

export const defaultStatusHandlerRegistry = {
  burn: burnStatusHandler,
  paralysis: paralysisStatusHandler,
} satisfies StatusHandlerRegistry;
