import {
  LumenArray,
  LumenBoolean,
  LumenBuiltin,
  LumenError,
  LumenFunction,
  LumenInteger,
  LumenString,
  NULL,
  type LumenObject,
} from '@runtime/objects.js';
import { Eval } from '@interpreter/evaluator/evaluator.js';
import { Environment } from '@interpreter/evaluator/environment.js';
import { ModuleLoader } from '../loader.js';

function getFirst(arr: LumenArray): LumenObject {
  return arr.elements.length > 0 ? arr.elements[0] : NULL;
}

function getRest(arr: LumenArray): LumenObject {
  if (arr.elements.length > 0) {
    const newElements = arr.elements.slice(1);
    return new LumenArray(newElements);
  }
  return NULL;
}

function applyUserFunction(
  fn: LumenObject,
  args: LumenObject[],
  loader: ModuleLoader,
): LumenObject {
  if (fn instanceof LumenFunction) {
    const extendedEnv = new Environment(fn.env);
    fn.parameters.forEach((param, paramIdx) => {
      extendedEnv.set(param.value, args[paramIdx], true);
    });
    const evaluated = Eval(fn.body, extendedEnv, loader);
    if (evaluated instanceof LumenError) {
      return evaluated;
    }
    return evaluated;
  }
  return new LumenError(`Expected a function, but got ${fn.type()}`);
}

function handlePrint(args: LumenObject[], printer: (message: string) => void): LumenObject {
  if (args.length > 0 && args[0] instanceof LumenString && args[0].value.includes('{?}')) {
    const formatString = args[0].value;
    const values = args.slice(1);
    let valueIndex = 0;
    const result = formatString.replace(/\{\?\}/g, () => {
      if (valueIndex < values.length) {
        return values[valueIndex++].inspect();
      }
      return '{?}';
    });
    printer(result);
  } else {
    const output = args.map((arg) => arg.inspect()).join(' ');
    printer(output);
  }
  return NULL;
}

const builtins: Map<string, LumenObject> = new Map([
  [
    'len',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length !== 1) {
        return new LumenError(`wrong number of arguments. got=${args.length}, want=1`);
      }
      const arg = args[0];
      if (arg instanceof LumenString) {
        return new LumenInteger(arg.value.length);
      }
      if (arg instanceof LumenArray) {
        return new LumenInteger(arg.elements.length);
      }
      return new LumenError(`argument to \`len\` not supported, got ${arg.type()}`);
    }),
  ],
  [
    'first',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length !== 1 || !(args[0] instanceof LumenArray)) {
        return new LumenError(`argument to \`first\` must be an array. got=${args[0]?.type()}`);
      }
      return getFirst(args[0] as LumenArray);
    }),
  ],
  [
    'rest',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length !== 1 || !(args[0] instanceof LumenArray)) {
        return new LumenError(`argument to \`rest\` must be an array. got=${args[0]?.type()}`);
      }
      return getRest(args[0] as LumenArray);
    }),
  ],
  [
    'prepend',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length !== 2) {
        return new LumenError(
          `wrong number of arguments for 'prepend': expected 2, got=${args.length}`,
        );
      }
      if (!(args[1] instanceof LumenArray)) {
        return new LumenError(
          `second argument to 'prepend' must be an array. got=${args[1]?.type()}`,
        );
      }
      const element = args[0];
      const array = args[1] as LumenArray;
      return new LumenArray([element, ...array.elements]);
    }),
  ],
  ['writeln', new LumenBuiltin((loader, ...args: LumenObject[]) => handlePrint(args, console.log))],
  [
    'write',
    new LumenBuiltin((loader, ...args: LumenObject[]) =>
      handlePrint(args, (msg) => process.stdout.write(msg)),
    ),
  ],
  [
    'toString',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length !== 1) {
        return new LumenError(
          `wrong number of arguments for 'toString': expected 1, got=${args.length}`,
        );
      }
      const arg = args[0];
      if (arg instanceof LumenInteger) {
        return new LumenString(`{ "type": "Integer", "value": ${arg.inspect()} }`);
      }
      if (arg instanceof LumenString) {
        return new LumenString(`{ "type": "String", "value": "${arg.value}" }`);
      }
      return new LumenString(arg.inspect());
    }),
  ],
  [
    'strFormat',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (args.length < 1 || !(args[0] instanceof LumenString)) {
        return new LumenError("first argument to 'strFormat' must be a string.");
      }
      const formatString = args[0].value;
      const values = args.slice(1);
      let valueIndex = 0;
      const result = formatString.replace(/\{\?\}/g, () => {
        if (valueIndex < values.length) {
          return values[valueIndex++].inspect();
        }
        return '{?}';
      });
      return new LumenString(result);
    }),
  ],
  [
    'map',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (
        args.length !== 2 ||
        !(args[0] instanceof LumenArray) ||
        !(args[1] instanceof LumenFunction)
      ) {
        return new LumenError('map expects an Array and a Function.');
      }
      const arr = args[0] as LumenArray;
      const fn = args[1] as LumenFunction;
      const result: LumenObject[] = [];
      for (const el of arr.elements) {
        const mapped = applyUserFunction(fn, [el], loader);
        if (mapped.type() === 'ERROR') return mapped;
        result.push(mapped);
      }
      return new LumenArray(result);
    }),
  ],
  [
    'filter',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (
        args.length !== 2 ||
        !(args[0] instanceof LumenArray) ||
        !(args[1] instanceof LumenFunction)
      ) {
        return new LumenError('filter expects an Array and a Function.');
      }
      const arr = args[0] as LumenArray;
      const predicate = args[1] as LumenFunction;
      const result: LumenObject[] = [];
      for (const el of arr.elements) {
        const decision = applyUserFunction(predicate, [el], loader);
        if (decision.type() === 'ERROR') return decision;
        if (decision instanceof LumenBoolean && decision.value) {
          result.push(el);
        }
      }
      return new LumenArray(result);
    }),
  ],
  [
    'reduce',
    new LumenBuiltin((loader, ...args: LumenObject[]) => {
      if (
        args.length !== 3 ||
        !(args[0] instanceof LumenArray) ||
        !(args[2] instanceof LumenFunction)
      ) {
        return new LumenError('reduce expects an Array, an initial value, and a Function.');
      }
      const arr = args[0] as LumenArray;
      let accumulator = args[1];
      const reducer = args[2] as LumenFunction;
      for (const el of arr.elements) {
        accumulator = applyUserFunction(reducer, [accumulator, el], loader);
        if (accumulator.type() === 'ERROR') return accumulator;
      }
      return accumulator;
    }),
  ],
]);

builtins.set('NULL', NULL);

export default builtins;
