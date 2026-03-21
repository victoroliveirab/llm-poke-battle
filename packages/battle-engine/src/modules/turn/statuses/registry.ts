import { paralysisStatusHandler } from './paralysis';
import { StatusHandlerRegistry } from './types';

export const defaultStatusHandlerRegistry = {
  paralysis: paralysisStatusHandler,
} satisfies StatusHandlerRegistry;
