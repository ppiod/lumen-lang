import { DOUBLE_TYPE, FunctionType, INTEGER_TYPE, type LumenType } from '@syntax/type.js';

const fnDoubleToDouble = new FunctionType([DOUBLE_TYPE], DOUBLE_TYPE);
const fnTwoDoublesToDouble = new FunctionType([DOUBLE_TYPE, DOUBLE_TYPE], DOUBLE_TYPE);

const fnNoArgsToDouble = new FunctionType([], DOUBLE_TYPE);
const fnTwoIntsToInt = new FunctionType([INTEGER_TYPE, INTEGER_TYPE], INTEGER_TYPE);

export const mathTypes = new Map<string, LumenType>([
  ['PI', DOUBLE_TYPE],
  ['E', DOUBLE_TYPE],

  ['sqrt', fnDoubleToDouble],
  ['abs', fnDoubleToDouble],
  ['sin', fnDoubleToDouble],
  ['cos', fnDoubleToDouble],
  ['tan', fnDoubleToDouble],
  ['log', fnDoubleToDouble],
  ['floor', fnDoubleToDouble],
  ['ceil', fnDoubleToDouble],
  ['round', fnDoubleToDouble],

  ['pow', fnTwoDoublesToDouble],
  ['min', fnTwoDoublesToDouble],
  ['max', fnTwoDoublesToDouble],

  ['random', fnNoArgsToDouble],
  ['randomInt', fnTwoIntsToInt],
]);
