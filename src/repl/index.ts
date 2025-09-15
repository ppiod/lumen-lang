import * as readline from 'readline';
import { Lexer } from '@interpreter/lexer.js';
import { Parser } from '@interpreter/parser.js';
import { Eval } from '@interpreter/evaluator/evaluator.js';
import { Environment } from '@interpreter/evaluator/environment.js';
import { ModuleLoader } from '../loader.js';
import { TypeEnvironment } from '@interpreter/typechecker/environment.js';
import { check } from '@interpreter/typechecker/typechecker.js';
import { builtinConstructors, builtinTypes } from '@core/index.js';
import { TypeKind } from '@syntax/type.js';

const PROMPT = '>> ';

export function startRepl() {
  const loader = new ModuleLoader(process.cwd());
  const evalEnv = new Environment();
  const typeEnv = new TypeEnvironment();

  for (const [name, type] of builtinTypes.entries()) {
    typeEnv.set(name, type, false);
  }
  for (const [name, type] of builtinConstructors.entries()) {
    typeEnv.constructors.set(name, type);
  }
  evalEnv.variantToSumType.set('Ok', 'Result');
  evalEnv.variantToSumType.set('Err', 'Result');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
  });

  console.log('Welcome to the Lumen REPL!');
  console.log('Press Ctrl+C to exit.');
  rl.prompt();

  rl.on('line', (line) => {
    if (line.trim() === '') {
      rl.prompt();
      return;
    }

    const lexer = new Lexer(line);
    const parser = new Parser(lexer);
    const program = parser.parseProgram();

    if (parser.errors.length > 0) {
      parser.errors.forEach((err) => console.error(`\x1b[31m${err}\x1b[0m`));
      rl.prompt();
      return;
    }

    const typeResult = check(program, typeEnv, loader);
    if (typeResult.kind() === TypeKind.ERROR) {
      console.error(`\x1b[31mTypeError: ${typeResult.toString()}\x1b[0m`);
      rl.prompt();
      return;
    }

    const evaluated = Eval(program, evalEnv, loader);
    if (evaluated && evaluated.type() !== 'NULL') {
      console.log(evaluated.inspect());
    }

    rl.prompt();
  }).on('close', () => {
    console.log('\nExiting Lumen REPL. Goodbye!');
    process.exit(0);
  });
}
