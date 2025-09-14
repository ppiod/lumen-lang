import { FunctionType, STRING_TYPE, type LumenType, TypeVariable, ANY_TYPE } from '@syntax/type.js';
import { RESULT_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

const ResultString = instantiateSumType(RESULT_TYPE, [STRING_TYPE, STRING_TYPE]);
const T = new TypeVariable('T');

const ResultAny = instantiateSumType(RESULT_TYPE, [ANY_TYPE, STRING_TYPE]);

export const jsonTypes = new Map<string, LumenType>([
  ['stringify', new FunctionType([T], ResultString, [T])],
  ['parse', new FunctionType([STRING_TYPE], ResultAny)],
]);
