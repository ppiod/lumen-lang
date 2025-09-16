import {
  FunctionType,
  STRING_TYPE,
  type LumenType,
  RecordType,
  TypeVariable,
  ANY_TYPE,
  NULL_TYPE,
  ArrayType,
  HashType,
} from '@syntax/type.js';
import { RESULT_TYPE } from '@core/types.js';
import { instantiateSumType } from '@interpreter/typechecker/utils.js';

export const SQLITE_DB_TYPE = new RecordType('Database', new Map(), []);
export const SQLITE_STMT_TYPE = new RecordType('Statement', new Map(), []);

const databaseConstructorType = new FunctionType([], SQLITE_DB_TYPE);

const ResultDB = instantiateSumType(RESULT_TYPE, [SQLITE_DB_TYPE, STRING_TYPE]);
const ResultStmt = instantiateSumType(RESULT_TYPE, [SQLITE_STMT_TYPE, STRING_TYPE]);
const ResultNull = instantiateSumType(RESULT_TYPE, [NULL_TYPE, STRING_TYPE]);
const T = new TypeVariable('T');
const ResultGet = instantiateSumType(RESULT_TYPE, [
  new HashType(STRING_TYPE, ANY_TYPE),
  STRING_TYPE,
]);
const ResultRun = instantiateSumType(RESULT_TYPE, [
  new HashType(STRING_TYPE, ANY_TYPE),
  STRING_TYPE,
]);

export const sqliteTypes = new Map<string, LumenType>([
  ['Database', SQLITE_DB_TYPE],
  ['Statement', SQLITE_STMT_TYPE],
  ['DatabaseConstructor', databaseConstructorType],
  ['open', new FunctionType([STRING_TYPE], ResultDB)],
  ['prepare', new FunctionType([SQLITE_DB_TYPE, STRING_TYPE], ResultStmt)],
  ['run', new FunctionType([SQLITE_STMT_TYPE, ANY_TYPE], ResultRun)],
  ['get', new FunctionType([SQLITE_STMT_TYPE, ANY_TYPE], ResultGet)],
  [
    'all',
    new FunctionType(
      [SQLITE_STMT_TYPE, ANY_TYPE],
      instantiateSumType(RESULT_TYPE, [
        new ArrayType(new HashType(STRING_TYPE, ANY_TYPE)),
        STRING_TYPE,
      ]),
    ),
  ],
  ['close', new FunctionType([SQLITE_DB_TYPE], NULL_TYPE)],
  [
    'transaction',
    new FunctionType(
      [SQLITE_DB_TYPE, new FunctionType([T], ResultNull, [T])],
      new FunctionType([T], ResultNull, [T]),
      [T],
    ),
  ],
]);
