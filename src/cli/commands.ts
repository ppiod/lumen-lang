import path from 'path';
import { ModuleLoader, LumenErrorWithSource } from '../loader.js';
import pkg from '../../package.json' with { type: 'json' };
import { printError } from './errors.js';
import { startRepl } from '@repl/index.js';

export function runFile(filePathArg: string) {
  const projectRoot = process.cwd();
  const entryFilePath = path.resolve(filePathArg);
  const relativePath = path.relative(projectRoot, entryFilePath);
  const entryModuleName = relativePath.replace(/\.lu$/, '').replace(/[\\/]/g, '.');

  const loader = new ModuleLoader(projectRoot);
  const module = loader.load(entryModuleName);

  if (module instanceof Error) {
    if (module instanceof LumenErrorWithSource) {
      printError(module);
    } else {
      console.error(module.message);
    }
    process.exit(1);
  }

  if (!module.program) {
    console.error('Cannot execute a native module directly.');
  }
}

export function showHelp() {
  console.log(`
Lumen CLI - v${pkg.version}

Usage:
  lumen <command> [arguments]

Commands:
  run <file>    Compiles and runs a Lumen file.
  version       Displays the current version of the Lumen CLI.
  about         Shows information about the Lumen language.
  help          Displays this help message.
  repl          Init the Repl.
  `);
}

export function showAbout() {
  console.log(`
Lumen is a functional, statically-typed programming language designed for building robust and maintainable software.
It features a strong type system, immutability by default, and powerful tools like pattern matching and traits.
  `);
}

export function showVersion() {
  console.log(`Lumen version ${pkg.version}`);
}

export function runRepl() {
  startRepl();
}
