import {
  FunctionType,
  HashType,
  INTEGER_TYPE,
  type LumenType,
  NULL_TYPE,
  RecordType,
  STRING_TYPE,
  TypeVariable,
  ANY_TYPE,
} from '@syntax/type.js';

const headersType = new HashType(STRING_TYPE, STRING_TYPE);
const paramsType = new HashType(STRING_TYPE, STRING_TYPE);

export const requestType = new RecordType(
  'Request',
  new Map([
    ['method', STRING_TYPE],
    ['url', STRING_TYPE],
    ['headers', headersType],
    ['body', STRING_TYPE],
  ]),
  ['method', 'url', 'headers', 'body'],
);

export const responseType = new RecordType(
  'Response',
  new Map([
    ['status', INTEGER_TYPE],
    ['body', STRING_TYPE],
    ['headers', headersType],
  ]),
  ['status', 'body', 'headers'],
);

const responseConstructorType = new FunctionType(
  [INTEGER_TYPE, STRING_TYPE, headersType],
  responseType,
);

const T = new TypeVariable('T');
const jsonConstructorType = new FunctionType([T], responseType, [T]);
const htmlConstructorType = new FunctionType([STRING_TYPE], responseType);

const handlerType = new FunctionType([requestType, paramsType], responseType);

const listenHandlerType = new FunctionType(
  [INTEGER_TYPE, new FunctionType([], NULL_TYPE), ANY_TYPE],
  NULL_TYPE,
);

export const httpTypes = new Map<string, LumenType>([
  ['Request', requestType],
  ['Response', responseType],
  ['ResponseConstructor', responseConstructorType],
  ['json', jsonConstructorType],
  ['html', htmlConstructorType],
  ['get', new FunctionType([STRING_TYPE, handlerType], NULL_TYPE)],
  ['post', new FunctionType([STRING_TYPE, handlerType], NULL_TYPE)],
  ['put', new FunctionType([STRING_TYPE, handlerType], NULL_TYPE)],
  ['delete', new FunctionType([STRING_TYPE, handlerType], NULL_TYPE)],
  ['patch', new FunctionType([STRING_TYPE, handlerType], NULL_TYPE)],
  ['listen', listenHandlerType],
]);
