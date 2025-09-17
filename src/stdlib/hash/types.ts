import {
  FunctionType,
  HashType,
  TypeVariable,
  type LumenType,
  BOOLEAN_TYPE,
  ArrayType,
  INTEGER_TYPE,
} from '@syntax/type.js';
import { OPTION_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

const K = new TypeVariable('K');
const V = new TypeVariable('V');

const OptionTypeV = instantiateSumType(OPTION_TYPE, [V]);

export const hashTypes = new Map<string, LumenType>([
  ['get', new FunctionType([new HashType(K, V), K], OptionTypeV, [K, V])],
  ['set', new FunctionType([new HashType(K, V), K, V], new HashType(K, V), [K, V])],
  ['delete', new FunctionType([new HashType(K, V), K], new HashType(K, V), [K, V])],
  ['has', new FunctionType([new HashType(K, V), K], BOOLEAN_TYPE, [K, V])],
  ['keys', new FunctionType([new HashType(K, V)], new ArrayType(K), [K, V])],
  ['values', new FunctionType([new HashType(K, V)], new ArrayType(V), [K, V])],
  ['size', new FunctionType([new HashType(K, V)], INTEGER_TYPE, [K, V])],
  ['isEmpty', new FunctionType([new HashType(K, V)], BOOLEAN_TYPE, [K, V])],
]);
