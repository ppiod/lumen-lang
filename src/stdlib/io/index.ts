import { execSync } from 'child_process';
import * as fs from 'fs';
import {
  LumenBuiltin,
  LumenError,
  LumenString,
  LumenSumTypeInstance,
  type LumenObject,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { ioTypes } from './types.js';

const Ok = (value: LumenObject) => new LumenSumTypeInstance('Result', 'Ok', [value]);
const Err = (message: string) =>
  new LumenSumTypeInstance('Result', 'Err', [new LumenString(message)]);

export const ioModule: NativeModule = {
  types: ioTypes,
  values: new Map<string, LumenObject>([
    [
      'exec',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return Err('io.exec espera 1 argumento do tipo String (o comando).');
        }
        const command = args[0].value;
        try {
          const output = execSync(command, { stdio: 'inherit', encoding: 'utf-8' });

          return Ok(new LumenString(output || ''));
        } catch (e: any) {
          return Err(e.message);
        }
      }),
    ],
    [
      'input',
      new LumenBuiltin((loader, ...args) => {
        if (args.length !== 1 || !(args[0] instanceof LumenString)) {
          return new LumenError('io.input espera 1 argumento do tipo String (o prompt).');
        }

        const prompt = args[0].value;
        process.stdout.write(prompt);

        const buffer = Buffer.alloc(1024);
        const bytesRead = fs.readSync(0, buffer, 0, 1024, null);
        const userInput = buffer.toString('utf-8', 0, bytesRead).trim();

        return new LumenString(userInput);
      }),
    ],
  ]),
};
