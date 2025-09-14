import type { FunctionType, LumenType } from '@syntax/type.js';
import type { LumenObject } from '@runtime/objects.js';
import { netHttp } from './http/index.js';
import { json } from './json/index.js';
import { math } from './math/index.js';
import { string } from './string/index.js';
import { fsModule } from './fs/index.js';
import { hashModule } from './hash/index.js';

export interface NativeModule {
  types: Map<string, LumenType>;
  values: Map<string, LumenObject>;
  constructors?: Map<
    string,
    {
      type: FunctionType;
      value: LumenObject;
    }
  >;
}

export const stdlib = new Map<string, NativeModule>([
  ['net.http', netHttp],
  ['json', json],
  ['math', math],
  ['string', string],
  ['fs', fsModule],
  ['hash', hashModule],
]);
