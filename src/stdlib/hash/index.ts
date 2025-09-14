import {
  LumenBuiltin,
  LumenError,
  LumenHash,
  type LumenObject,
  NULL,
  LumenSumTypeInstance,
  type Hashable,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { hashTypes } from './types.js';

const Ok = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Ok', [value]);
const Err = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Err', [value]);

export const hashModule: NativeModule = {
  types: hashTypes,
  values: new Map([
    [
      'get',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 2) {
          return new LumenError(`hash.get expects 2 arguments, but got ${args.length}`);
        }
        const hash = args[0];
        const key = args[1];

        if (!(hash instanceof LumenHash)) {
          return new LumenError(`Expected a Hash as the first argument, but got ${hash.type()}`);
        }

        if (!('hashKey' in key && typeof (key as any).hashKey === 'function')) {
          return new LumenError(`Key of type ${key.type()} is not hashable.`);
        }

        const hashableKey = key as Hashable;
        const pair = hash.pairs.get(hashableKey.hashKey());

        if (!pair) {
          return Err(NULL);
        }
        return Ok(pair.value);
      }),
    ],
    [
      'set',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 3) {
          return new LumenError(`hash.set expects 3 arguments, but got ${args.length}`);
        }
        const hash = args[0];
        const key = args[1];
        const value = args[2];

        if (!(hash instanceof LumenHash)) {
          return new LumenError(`Expected a Hash as the first argument, but got ${hash.type()}`);
        }

        if (!('hashKey' in key && typeof (key as any).hashKey === 'function')) {
          return new LumenError(`Key of type ${key.type()} is not hashable.`);
        }

        const hashableKey = key as Hashable;
        hash.pairs.set(hashableKey.hashKey(), { key, value });

        return hash;
      }),
    ],
  ]),
};
