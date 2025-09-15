import {
  LumenBuiltin,
  LumenError,
  LumenInteger,
  NULL,
  type LumenObject,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { datetimeTypes } from './types.js';

const syncSleep = (ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Void loop.
  }
};

export const datetimeModule: NativeModule = {
  types: datetimeTypes,
  values: new Map<string, LumenObject>([
    [
      'sleep',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenInteger)) {
          return new LumenError(
            'A função sleep espera 1 argumento do tipo Integer (milissegundos).',
          );
        }
        syncSleep(args[0].value);
        return NULL;
      }),
    ],
    [
      'now',
      new LumenBuiltin(() => {
        return new LumenInteger(Date.now());
      }),
    ],
  ]),
};
