import pino from 'pino';
import pretty from 'pino-pretty';
import { inspect } from 'node:util';

const level = process.env.LOG_LEVEL ?? 'info';

function colorizedObject(value: unknown) {
  return inspect(value, {
    colors: true,
    depth: null,
    compact: false,
    breakLength: 100,
  });
}

const stream = pretty({
  colorize: true,
  colorizeObjects: true,
  translateTime: 'SYS:standard',
  ignore: 'pid,hostname',
  customPrettifiers: {
    args: (value) => colorizedObject(value),
    response: (value) => colorizedObject(value),
  },
});

export const logger = pino({ level }, stream);
