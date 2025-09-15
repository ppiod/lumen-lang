export enum TokenType {
  // Special tokens
  ILLEGAL = 'ILLEGAL',
  EOF = 'EOF',

  // Identifiers + Literals
  IDENT = 'IDENT',
  INT = 'INT',
  DOUBLE = 'DOUBLE',
  STRING = 'STRING',

  // Operators
  ASSIGN = '=',
  PLUS = '+',
  PLUS_ASSIGN = '+=',
  MINUS = '-',
  BANG = '!',
  ASTERISK = '*',
  SLASH = '/',
  PERCENT = '%',

  LT = '<',
  GT = '>',
  GTE = '>=',
  LTE = '<=',

  EQ = '==',
  NOT_EQ = '!=',
  AND = '&&',

  ARROW = '->',
  PIPE = '|>',
  BAR = '|',
  TYPE = 'TYPE',
  FAT_ARROW = '=>',

  // Delimiters
  COMMA = ',',
  SEMICOLON = ';',
  COLON = ':',

  LPAREN = '(',
  RPAREN = ')',
  LBRACE = '{',
  RBRACE = '}',
  LBRACKET = '[',
  RBRACKET = ']',
  QUESTION = '?',

  // Keywords
  FUNCTION = 'FUNCTION',
  LET = 'LET',
  MUT = 'MUT',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  MATCH = 'MATCH',
  WHEN = 'WHEN',
  IF = 'IF',
  ELSE = 'ELSE',
  RETURN = 'RETURN',
  RECORD = 'RECORD',
  DOT = '.',
  DOTDOTDOT = '...',
  TRAIT = 'TRAIT',
  IMPL = 'IMPL',
  FOR = 'FOR',
  MODULE = 'MODULE',
  EXPOSING = 'EXPOSING',
  USE = 'USE',
  AS = 'AS',
}

export interface Token {
  type: TokenType;
  literal: string;
  line: number;
  column: number;
}

const keywords: Map<string, TokenType> = new Map([
  ['fn', TokenType.FUNCTION],
  ['let', TokenType.LET],
  ['mut', TokenType.MUT],
  ['type', TokenType.TYPE],
  ['match', TokenType.MATCH],
  ['when', TokenType.WHEN],
  ['true', TokenType.TRUE],
  ['false', TokenType.FALSE],
  ['if', TokenType.IF],
  ['else', TokenType.ELSE],
  ['return', TokenType.RETURN],
  ['record', TokenType.RECORD],
  ['trait', TokenType.TRAIT],
  ['impl', TokenType.IMPL],
  ['for', TokenType.FOR],
  ['module', TokenType.MODULE],
  ['exposing', TokenType.EXPOSING],
  ['use', TokenType.USE],
  ['as', TokenType.AS],
  ['Any', TokenType.IDENT],
]);

export function lookupIdent(ident: string): TokenType {
  return keywords.get(ident) || TokenType.IDENT;
}
