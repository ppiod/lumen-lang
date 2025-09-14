import { FunctionType, HashType, NULL_TYPE, TypeVariable, type LumenType } from '@syntax/type.js';
import { RESULT_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

const K = new TypeVariable('K');
const V = new TypeVariable('V');

const ResultType = instantiateSumType(RESULT_TYPE, [V, NULL_TYPE]);

export const hashTypes = new Map<string, LumenType>([
  ['get', new FunctionType([new HashType(K, V), K], ResultType, [K, V])],
  ['set', new FunctionType([new HashType(K, V), K, V], new HashType(K, V), [K, V])],
]);
