import { FunctionType, INTEGER_TYPE, NULL_TYPE, type LumenType } from '@syntax/type.js';

export const datetimeTypes = new Map<string, LumenType>([
  ['sleep', new FunctionType([INTEGER_TYPE], NULL_TYPE)],
  ['now', new FunctionType([], INTEGER_TYPE)],
]);
