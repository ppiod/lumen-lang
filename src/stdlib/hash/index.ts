import {
  LumenBuiltin,
  LumenError,
  LumenHash,
  type LumenObject,
  LumenSumTypeInstance,
  type Hashable,
  LumenBoolean,
  LumenArray,
  LumenInteger,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { hashTypes } from './types.js';

const Some = (value: LumenObject) => new LumenSumTypeInstance('Option', 'Some', [value]);
const None = () => new LumenSumTypeInstance('Option', 'None', []);

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
          return None();
        }
        return Some(pair.value);
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
    [
      'delete',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 2) {
          return new LumenError(`hash.delete expects 2 arguments, but got ${args.length}`);
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
        hash.pairs.delete(hashableKey.hashKey());

        return hash;
      }),
    ],
    [
      'has',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 2) {
          return new LumenError(`hash.has expects 2 arguments, but got ${args.length}`);
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
        return new LumenBoolean(hash.pairs.has(hashableKey.hashKey()));
      }),
    ],
    [
      'keys',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenHash)) {
          return new LumenError('hash.keys expects 1 Hash argument.');
        }
        const hash = args[0];
        const keys = Array.from(hash.pairs.values()).map((pair) => pair.key);
        return new LumenArray(keys);
      }),
    ],
    [
      'values',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenHash)) {
          return new LumenError('hash.values expects 1 Hash argument.');
        }
        const hash = args[0];
        const values = Array.from(hash.pairs.values()).map((pair) => pair.value);
        return new LumenArray(values);
      }),
    ],
    [
      'size',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenHash)) {
          return new LumenError('hash.size expects 1 Hash argument.');
        }
        const hash = args[0];
        return new LumenInteger(hash.pairs.size);
      }),
    ],
    [
      'isEmpty',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenHash)) {
          return new LumenError('hash.isEmpty expects 1 Hash argument.');
        }
        const hash = args[0];
        return new LumenBoolean(hash.pairs.size === 0);
      }),
    ],
  ]),
};
