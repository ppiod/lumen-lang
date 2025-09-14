import {
  STRING_TYPE,
  BOOLEAN_TYPE,
  ArrayType,
  FunctionType,
  type LumenType,
  INTEGER_TYPE,
} from '@syntax/type.js';

const stringArrayType = new ArrayType(STRING_TYPE);

export const stringTypes = new Map<string, LumenType>([
  ['split', new FunctionType([STRING_TYPE, STRING_TYPE], stringArrayType)],
  ['join', new FunctionType([stringArrayType, STRING_TYPE], STRING_TYPE)],
  ['trim', new FunctionType([STRING_TYPE], STRING_TYPE)],
  ['toUpper', new FunctionType([STRING_TYPE], STRING_TYPE)],
  ['toLower', new FunctionType([STRING_TYPE], STRING_TYPE)],
  ['contains', new FunctionType([STRING_TYPE, STRING_TYPE], BOOLEAN_TYPE)],
  ['replace', new FunctionType([STRING_TYPE, STRING_TYPE, STRING_TYPE], STRING_TYPE)],

  ['toInteger', new FunctionType([STRING_TYPE], INTEGER_TYPE)],
]);
