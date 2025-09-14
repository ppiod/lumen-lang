import {
  ANY_TYPE,
  ArrayType,
  BOOLEAN_TYPE,
  FunctionType,
  NULL_TYPE,
  INTEGER_TYPE,
  STRING_TYPE,
  TypeVariable,
  SumType,
  VariantType,
  type LumenType,
} from '@syntax/type.js';

const T = new TypeVariable('T');
const U = new TypeVariable('U');

export const builtinTypes = new Map<string, LumenType>([
  ['len', new FunctionType([ANY_TYPE], INTEGER_TYPE)],
  ['toString', new FunctionType([ANY_TYPE], STRING_TYPE)],
  ['map', new FunctionType([new ArrayType(T), new FunctionType([T], U)], new ArrayType(U), [T, U])],
  [
    'filter',
    new FunctionType([new ArrayType(T), new FunctionType([T], BOOLEAN_TYPE)], new ArrayType(T), [
      T,
    ]),
  ],
  ['reduce', new FunctionType([new ArrayType(T), U, new FunctionType([U, T], U)], U, [T, U])],
  ['NULL', NULL_TYPE],
]);

const T_RESULT = new TypeVariable('T');
const E_RESULT = new TypeVariable('E');

export const RESULT_TYPE = new SumType('Result', [T_RESULT, E_RESULT]);

const OK_VARIANT = new VariantType('Ok', [T_RESULT], RESULT_TYPE);
const ERR_VARIANT = new VariantType('Err', [E_RESULT], RESULT_TYPE);

RESULT_TYPE.variants.set('Ok', OK_VARIANT);
RESULT_TYPE.variants.set('Err', ERR_VARIANT);

builtinTypes.set('Result', RESULT_TYPE);

export const builtinConstructors = new Map<string, FunctionType>([
  ['Ok', new FunctionType([T_RESULT], RESULT_TYPE, [T_RESULT, E_RESULT])],
  ['Err', new FunctionType([E_RESULT], RESULT_TYPE, [T_RESULT, E_RESULT])],
]);
