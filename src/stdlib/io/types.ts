import { FunctionType, STRING_TYPE, type LumenType } from '@syntax/type.js';
import { RESULT_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

const ResultString = instantiateSumType(RESULT_TYPE, [STRING_TYPE, STRING_TYPE]);

export const ioTypes = new Map<string, LumenType>([
  ['exec', new FunctionType([STRING_TYPE], ResultString)],
  ['input', new FunctionType([STRING_TYPE], STRING_TYPE)],
]);
