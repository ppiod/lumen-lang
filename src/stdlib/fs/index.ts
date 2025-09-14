import fs from 'fs';
import path from 'path';
import {
  LumenArray,
  LumenBoolean,
  LumenBuiltin,
  LumenString,
  LumenSumTypeInstance,
  NULL,
  type LumenObject,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { fsTypes } from './types.js';

const Ok = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Ok', [value]);
const Err = (message: string) =>
  new LumenSumTypeInstance('Result', 'Err', [new LumenString(message)]);

export const fsModule: NativeModule = {
  types: fsTypes,
  values: new Map<string, LumenObject>([
    [
      'readFile',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('readFile expects 1 String argument: path.');
        }
        try {
          const filePath = path.resolve(args[0].value);
          const content = fs.readFileSync(filePath, 'utf-8');
          return Ok(new LumenString(content));
        } catch (e) {
          return Err(`Could not read file: ${e}`);
        }
      }),
    ],
    [
      'writeFile',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenString) ||
          !(args[1] instanceof LumenString)
        ) {
          return Err('writeFile expects 2 String arguments: path and content.');
        }
        try {
          const filePath = path.resolve(args[0].value);
          fs.writeFileSync(filePath, args[1].value, 'utf-8');
          return Ok(NULL);
        } catch (e) {
          return Err(`Could not write to file: ${e}`);
        }
      }),
    ],
    [
      'exists',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('exists expects 1 String argument: path.');
        }
        const filePath = path.resolve(args[0].value);
        return Ok(new LumenBoolean(fs.existsSync(filePath)));
      }),
    ],
    [
      'deleteFile',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('deleteFile expects 1 String argument: path.');
        }
        try {
          const filePath = path.resolve(args[0].value);
          fs.unlinkSync(filePath);
          return Ok(NULL);
        } catch (e) {
          return Err(`Could not delete file: ${e}`);
        }
      }),
    ],
    [
      'listDir',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('listDir expects 1 String argument: path.');
        }
        try {
          const dirPath = path.resolve(args[0].value);
          const entries = fs.readdirSync(dirPath);
          return Ok(new LumenArray(entries.map((e) => new LumenString(e))));
        } catch (e) {
          return Err(`Could not list directory: ${e}`);
        }
      }),
    ],
  ]),
};
