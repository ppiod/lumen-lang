import { Database as BunDatabase } from 'bun:sqlite';
import {
  LumenBuiltin,
  LumenError,
  LumenString,
  LumenSumTypeInstance,
  type LumenObject,
  NULL,
  LumenHash,
  LumenArray,
  LumenFunction,
  LumenInteger,
  LumenDouble,
  LumenBoolean,
  LumenRecord,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { sqliteTypes } from './types.js';
import { LumenSQLiteDB, LumenSQLiteStatement } from './objects.js';
import { applyFunction } from '@interpreter/evaluator/evaluator.js';
import { FunctionType } from '@syntax/type.js';

const Ok = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Ok', [value]);
const Err = (message: string) =>
  new LumenSumTypeInstance('Result', 'Err', [new LumenString(message)]);

function lumenToJS(value: LumenObject): any {
  if (value instanceof LumenString) return value.value;
  if (value instanceof LumenInteger) return value.value;
  if (value instanceof LumenDouble) return value.value;
  if (value instanceof LumenBoolean) return value.value;
  if (value === NULL) return null;
  if (value instanceof LumenArray) {
    return value.elements.map(lumenToJS);
  }
  if (value instanceof LumenRecord) {
    const obj: Record<string, any> = {};
    for (const [key, val] of value.fields.entries()) {
      obj[key] = lumenToJS(val);
    }
    return obj;
  }
  if (value instanceof LumenHash) {
    const obj: Record<string, any> = {};
    for (const { key, value: val } of value.pairs.values()) {
      obj[key.inspect()] = lumenToJS(val);
    }
    return obj;
  }
  return value.inspect();
}

function jsToLumen(value: any): LumenObject {
  if (typeof value === 'string') return new LumenString(value);
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return new LumenInteger(value);
    return new LumenDouble(value);
  }
  if (typeof value === 'boolean') return new LumenBoolean(value);
  if (value === null) return NULL;
  if (Array.isArray(value)) {
    return new LumenArray(value.map(jsToLumen));
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Buffer) &&
    !(value instanceof Uint8Array)
  ) {
    const pairs = new Map();
    for (const key in value) {
      const lumenKey = new LumenString(key);
      pairs.set(lumenKey.hashKey(), {
        key: lumenKey,
        value: jsToLumen(value[key]),
      });
    }
    return new LumenHash(pairs);
  }
  if (value instanceof Buffer || value instanceof Uint8Array) {
    return new LumenString(value.toString());
  }
  return NULL;
}

function prepareParams(params: LumenObject): any[] | Record<string, any> | undefined {
  if (params instanceof LumenRecord) {
    const obj: Record<string, any> = {};
    for (const [key, value] of params.fields.entries()) {
      obj[`$${key}`] = lumenToJS(value);
    }
    return obj;
  }

  if (params instanceof LumenHash) {
    const obj: Record<string, any> = {};
    for (const { key, value } of params.pairs.values()) {
      obj[`$${key.inspect()}`] = lumenToJS(value);
    }
    return obj;
  }
  if (params instanceof LumenArray) {
    return params.elements.map(lumenToJS);
  }
  return undefined;
}

export const sqliteModule: NativeModule = {
  types: sqliteTypes,
  values: new Map<string, LumenObject>([
    [
      'open',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('sqlite.open expects 1 String argument: the file path.');
        }
        try {
          const db = new BunDatabase(args[0].value);
          db.exec('PRAGMA journal_mode = WAL;');
          return Ok(new LumenSQLiteDB(db));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'prepare',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenSQLiteDB) ||
          !(args[1] instanceof LumenString)
        ) {
          return Err('db.prepare expects a Database and a SQL String.');
        }
        const db = args[0].db;
        try {
          const stmt = db.prepare(args[1].value);
          return Ok(new LumenSQLiteStatement(stmt));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'run',
      new LumenBuiltin((loader, ...args) => {
        if (args.length < 1 || !(args[0] instanceof LumenSQLiteStatement)) {
          return Err('statement.run expects a Statement object.');
        }
        const stmt = args[0].stmt;
        const params = prepareParams(args[1]);
        try {
          const result = stmt.run(params);
          const pairs = new Map();

          let key = new LumenString('lastInsertRowid');
          pairs.set(key.hashKey(), { key, value: jsToLumen(result.lastInsertRowid) });

          key = new LumenString('changes');
          pairs.set(key.hashKey(), { key, value: jsToLumen(result.changes) });

          return Ok(new LumenHash(pairs));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'get',
      new LumenBuiltin((loader, ...args) => {
        if (args.length < 1 || !(args[0] instanceof LumenSQLiteStatement)) {
          return Err('statement.get expects a Statement object.');
        }
        const stmt = args[0].stmt;
        const params = prepareParams(args[1]);
        try {
          const row = stmt.get(params) as Record<string, any> | null;
          if (!row) return Ok(NULL);

          const pairs = new Map();
          for (const key in row) {
            pairs.set(new LumenString(key).hashKey(), {
              key: new LumenString(key),
              value: jsToLumen(row[key]),
            });
          }
          return Ok(new LumenHash(pairs));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'all',
      new LumenBuiltin((loader, ...args) => {
        if (args.length < 1 || !(args[0] instanceof LumenSQLiteStatement)) {
          return Err('statement.all expects a Statement object.');
        }
        const stmt = args[0].stmt;
        const params = prepareParams(args[1]);
        try {
          const rows = stmt.all(params) as Record<string, any>[];
          const lumenRows = rows.map((row) => {
            const pairs = new Map();
            for (const key in row) {
              pairs.set(new LumenString(key).hashKey(), {
                key: new LumenString(key),
                value: jsToLumen(row[key]),
              });
            }
            return new LumenHash(pairs);
          });
          return Ok(new LumenArray(lumenRows));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'transaction',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenSQLiteDB) ||
          !(args[1] instanceof LumenFunction)
        ) {
          return Err('db.transaction expects a Database and a function.');
        }
        const db = args[0].db;
        const lumenFn = args[1];

        const transaction = db.transaction((...jsArgs) => {
          const lumenArgs = jsArgs.map(jsToLumen);
          const result = applyFunction(lumenFn, lumenArgs, loader);

          if (result instanceof LumenSumTypeInstance && result.variantName === 'Err') {
            const errorMsg = result.values[0]?.inspect() || 'Transaction failed';
            throw new Error(errorMsg);
          }
          if (result instanceof LumenError) {
            throw new Error(result.message);
          }
        });

        return new LumenBuiltin((tLoader, ...tArgs) => {
          const jsArgs = tArgs.map(lumenToJS);
          try {
            transaction(...jsArgs);
            return Ok(NULL);
          } catch (e: any) {
            return Err(e.message);
          }
        });
      }),
    ],
    [
      'close',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenSQLiteDB)) {
          return Err('db.close expects a Database object.');
        }
        args[0].db.close();
        return NULL;
      }),
    ],
  ]),
  constructors: new Map([
    [
      'Database',
      {
        type: sqliteTypes.get('DatabaseConstructor')! as FunctionType,
        value: new LumenBuiltin(
          () =>
            new LumenError(
              "Type 'Database' cannot be constructed directly. Use sqlite.open() instead.",
            ),
        ),
      },
    ],
  ]),
};
