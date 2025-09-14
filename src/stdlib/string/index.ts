import {
  LumenArray,
  LumenBoolean,
  LumenInteger,
  LumenBuiltin,
  LumenError,
  LumenString,
  type LumenObject,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { stringTypes } from './types.js';

export const string: NativeModule = {
  types: stringTypes,
  values: new Map<string, LumenObject>([
    [
      'split',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenString) ||
          !(args[1] instanceof LumenString)
        ) {
          return new LumenError('split expects 2 String arguments: text and separator.');
        }
        const elements = args[0].value.split(args[1].value).map((s) => new LumenString(s));
        return new LumenArray(elements);
      }),
    ],
    [
      'join',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenArray) ||
          !(args[1] instanceof LumenString)
        ) {
          return new LumenError('join expects an Array<String> and a String separator.');
        }
        const arr = args[0].elements;
        const separator = args[1].value;
        const strElements = arr.map((obj) => {
          if (!(obj instanceof LumenString)) {
            return new LumenError('join expects an array containing only Strings.');
          }
          return obj.value;
        });

        const error = strElements.find((el) => el instanceof LumenError);
        if (error) return error;

        return new LumenString((strElements as string[]).join(separator));
      }),
    ],
    [
      'trim',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return new LumenError('trim expects 1 String argument.');
        }
        return new LumenString(args[0].value.trim());
      }),
    ],
    [
      'toUpper',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return new LumenError('toUpper expects 1 String argument.');
        }
        return new LumenString(args[0].value.toUpperCase());
      }),
    ],
    [
      'toLower',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return new LumenError('toLower expects 1 String argument.');
        }
        return new LumenString(args[0].value.toLowerCase());
      }),
    ],
    [
      'contains',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenString) ||
          !(args[1] instanceof LumenString)
        ) {
          return new LumenError('contains expects 2 String arguments: text and substring.');
        }
        return new LumenBoolean(args[0].value.includes(args[1].value));
      }),
    ],
    [
      'replace',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 3 ||
          !(args[0] instanceof LumenString) ||
          !(args[1] instanceof LumenString) ||
          !(args[2] instanceof LumenString)
        ) {
          return new LumenError(
            'replace expects 3 String arguments: text, searchValue, and replaceValue.',
          );
        }
        return new LumenString(args[0].value.replace(args[1].value, args[2].value));
      }),
    ],
    [
      'toInteger',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return new LumenError('toInteger expects 1 String argument.');
        }
        const num = parseInt(args[0].value, 10);

        return new LumenInteger(isNaN(num) ? 0 : num);
      }),
    ],
  ]),
};
