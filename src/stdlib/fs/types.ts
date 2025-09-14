import {
  NULL_TYPE,
  STRING_TYPE,
  BOOLEAN_TYPE,
  ArrayType,
  FunctionType,
  type LumenType,
} from '@syntax/type.js';
import { RESULT_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

const ResultString = instantiateSumType(RESULT_TYPE, [STRING_TYPE, STRING_TYPE]);
const ResultNull = instantiateSumType(RESULT_TYPE, [NULL_TYPE, STRING_TYPE]);
const ResultBoolean = instantiateSumType(RESULT_TYPE, [BOOLEAN_TYPE, STRING_TYPE]);
const ResultStringArray = instantiateSumType(RESULT_TYPE, [
  new ArrayType(STRING_TYPE),
  STRING_TYPE,
]);

export const fsTypes = new Map<string, LumenType>([
  ['readFile', new FunctionType([STRING_TYPE], ResultString)],
  ['writeFile', new FunctionType([STRING_TYPE, STRING_TYPE], ResultNull)],
  ['exists', new FunctionType([STRING_TYPE], ResultBoolean)],
  ['deleteFile', new FunctionType([STRING_TYPE], ResultNull)],
  ['listDir', new FunctionType([STRING_TYPE], ResultStringArray)],
]);
