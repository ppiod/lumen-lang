import {
  LumenBuiltin,
  LumenDouble,
  LumenError,
  LumenInteger,
  type LumenObject,
} from '@runtime/objects.js';
import type { NativeModule } from '@stdlib/index.js';
import { mathTypes } from './types.js';

const makeUnaryMathBuiltin = (mathFn: (n: number) => number) => {
  return new LumenBuiltin((loader, ...args) => {
    if (args.length !== 1 || !(args[0] instanceof LumenDouble)) {
      return new LumenError(`Expected 1 Double argument.`);
    }
    const result = mathFn(args[0].value);
    return new LumenDouble(result);
  });
};

const makeBinaryMathBuiltin = (mathFn: (a: number, b: number) => number) => {
  return new LumenBuiltin((loader, ...args) => {
    if (
      args.length !== 2 ||
      !(args[0] instanceof LumenDouble) ||
      !(args[1] instanceof LumenDouble)
    ) {
      return new LumenError(`Expected 2 Double arguments.`);
    }
    const result = mathFn(args[0].value, args[1].value);
    return new LumenDouble(result);
  });
};

export const math: NativeModule = {
  types: mathTypes,
  values: new Map<string, LumenObject>([
    ['PI', new LumenDouble(Math.PI)],
    ['E', new LumenDouble(Math.E)],

    ['sqrt', makeUnaryMathBuiltin(Math.sqrt)],
    ['abs', makeUnaryMathBuiltin(Math.abs)],
    ['sin', makeUnaryMathBuiltin(Math.sin)],
    ['cos', makeUnaryMathBuiltin(Math.cos)],
    ['tan', makeUnaryMathBuiltin(Math.tan)],
    ['log', makeUnaryMathBuiltin(Math.log)],
    ['floor', makeUnaryMathBuiltin(Math.floor)],
    ['ceil', makeUnaryMathBuiltin(Math.ceil)],
    ['round', makeUnaryMathBuiltin(Math.round)],
    ['pow', makeBinaryMathBuiltin(Math.pow)],
    ['min', makeBinaryMathBuiltin(Math.min)],
    ['max', makeBinaryMathBuiltin(Math.max)],

    [
      'random',
      new LumenBuiltin(() => {
        return new LumenDouble(Math.random());
      }),
    ],
    [
      'randomInt',
      new LumenBuiltin((loader, ...args) => {
        if (
          args.length !== 2 ||
          !(args[0] instanceof LumenInteger) ||
          !(args[1] instanceof LumenInteger)
        ) {
          return new LumenError(`Expected 2 Integer arguments for min and max.`);
        }
        const min = args[0].value;
        const max = args[1].value;
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return new LumenInteger(result);
      }),
    ],
  ]),
};
