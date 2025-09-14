import {
  LumenArray,
  LumenBoolean,
  LumenBuiltin,
  LumenDouble,
  LumenHash,
  LumenInteger,
  type LumenObject,
  LumenRecord,
  LumenString,
  LumenSumTypeInstance,
  ObjectType,
  NULL,
  type HashPair,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { jsonTypes } from './types.js';

function jsToLumen(value: any): LumenObject {
  if (value === null) return NULL;
  if (typeof value === 'string') return new LumenString(value);
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return new LumenInteger(value);
    return new LumenDouble(value);
  }
  if (typeof value === 'boolean') return new LumenBoolean(value);
  if (Array.isArray(value)) {
    return new LumenArray(value.map(jsToLumen));
  }
  if (typeof value === 'object') {
    const pairs = new Map<string, HashPair>();
    for (const key in value) {
      const lumenKey = new LumenString(key);
      const lumenValue = jsToLumen(value[key]);
      pairs.set(lumenKey.hashKey(), { key: lumenKey, value: lumenValue });
    }
    return new LumenHash(pairs);
  }
  return NULL;
}

const Ok = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Ok', [value]);
const Err = (message: string) =>
  new LumenSumTypeInstance('Result', 'Err', [new LumenString(message)]);

export function stringifyRecursive(obj: LumenObject, indentLevel: number): string | Error {
  const indent = '  '.repeat(indentLevel);
  const closingIndent = '  '.repeat(indentLevel > 0 ? indentLevel - 1 : 0);

  switch (obj.type()) {
    case ObjectType.STRING:
      return `"${(obj as LumenString).value}"`;
    case ObjectType.INTEGER:
      return (obj as LumenInteger).value.toString();
    case ObjectType.DOUBLE:
      return (obj as LumenDouble).value.toString();
    case ObjectType.BOOLEAN:
      return (obj as LumenBoolean).value.toString();
    case ObjectType.NULL:
      return 'null';
    case ObjectType.ARRAY: {
      const elements = (obj as LumenArray).elements;
      if (elements.length === 0) return '[]';
      const stringifiedElements = elements.map((el) => stringifyRecursive(el, indentLevel + 1));
      if (stringifiedElements.some((e) => e instanceof Error)) {
        return new Error('Failed to serialize an element in the array.');
      }
      return `[\n${indent}${stringifiedElements.join(`,\n${indent}`)}\n${closingIndent}]`;
    }
    case ObjectType.SUM_TYPE_INSTANCE: {
      const sumInstance = obj as LumenSumTypeInstance;
      if (sumInstance.values.length === 1) {
        return stringifyRecursive(sumInstance.values[0], indentLevel);
      }
      return new Error(
        `SumType variant ${sumInstance.variantName} with multiple values cannot be converted to JSON.`,
      );
    }
    case ObjectType.RECORD: {
      const record = obj as LumenRecord;
      const pairs = [...record.fields.entries()];
      if (pairs.length === 0) return '{}';

      const stringifiedPairs = [];
      for (const [key, value] of pairs) {
        const jsonKey = `"${key}"`;
        const jsonValue = stringifyRecursive(value, indentLevel + 1);
        if (jsonValue instanceof Error) return jsonValue;
        stringifiedPairs.push(`${jsonKey}: ${jsonValue}`);
      }
      return `{\n${indent}${stringifiedPairs.join(`,\n${indent}`)}\n${closingIndent}}`;
    }
    case ObjectType.HASH: {
      const hash = obj as LumenHash;
      const pairs = [...hash.pairs.values()];
      if (pairs.length === 0) return '{}';

      const stringifiedPairs = [];
      for (const { key, value } of pairs) {
        if (key.type() !== ObjectType.STRING) {
          return new Error('Only hashes with string keys can be converted to JSON.');
        }
        const jsonKey = `"${(key as LumenString).value}"`;
        const jsonValue = stringifyRecursive(value, indentLevel + 1);
        if (jsonValue instanceof Error) return jsonValue;
        stringifiedPairs.push(`${jsonKey}: ${jsonValue}`);
      }
      return `{\n${indent}${stringifiedPairs.join(`,\n${indent}`)}\n${closingIndent}}`;
    }
    default:
      return new Error(`Value of type ${obj.type()} cannot be converted to JSON.`);
  }
}

export const json: NativeModule = {
  types: jsonTypes,
  values: new Map([
    [
      'stringify',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1) {
          return Err('stringify expects 1 argument');
        }
        const result = stringifyRecursive(args[0], 1);
        if (result instanceof Error) {
          return Err(result.message);
        }
        return Ok(new LumenString(result));
      }),
    ],
    [
      'parse',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('parse expects 1 String argument.');
        }
        try {
          const parsed = JSON.parse(args[0].value);
          return Ok(jsToLumen(parsed));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
  ]),
};
