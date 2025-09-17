import { type Token, TokenType, lookupIdent } from '@syntax/token.js';

export class Lexer {
  private input: string;
  private position: number;
  private readPosition: number;
  private ch: string | null;
  private line: number;
  private column: number;

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.readPosition = 0;
    this.ch = null;
    this.line = 1;
    this.column = 1;
    this.readChar();
  }

  private readChar(): void {
    if (this.readPosition >= this.input.length) {
      this.ch = null;
    } else {
      this.ch = this.input[this.readPosition];
    }
    this.position = this.readPosition;
    this.readPosition += 1;

    if (this.ch !== '\n') {
      this.column += 1;
    }
  }

  public peekChar(): string | null {
    if (this.readPosition >= this.input.length) return null;
    return this.input[this.readPosition];
  }

  private skipMultiLineComment(): void {
    this.readChar();
    this.readChar();

    while (this.ch !== null) {
      if (this.ch === '*' && this.peekChar() === '/') {
        this.readChar();
        this.readChar();
        break;
      }

      if (this.ch === '\n') {
        this.line++;
        this.column = 1;
      }
      this.readChar();
    }
  }

  public nextToken(): Token {
    this.skipWhitespace();

    if (this.ch === null) {
      return { type: TokenType.EOF, literal: '', line: this.line, column: this.column };
    }

    const startLine = this.line;
    const startCol = this.column;

    const createToken = (type: TokenType, literal: string): Token => {
      return { type, literal, line: startLine, column: startCol };
    };

    if (this.ch === '/') {
      if (this.peekChar() === '/') {
        this.skipComment();
        return this.nextToken();
      }
      if (this.peekChar() === '*') {
        this.skipMultiLineComment();
        return this.nextToken();
      }
    }

    const twoCharOperators = new Map<string, TokenType>([
      ['==', TokenType.EQ],
      ['!=', TokenType.NOT_EQ],
      ['>=', TokenType.GTE],
      ['<=', TokenType.LTE],
      ['&&', TokenType.AND],
      ['||', TokenType.OR],
      ['->', TokenType.ARROW],
      ['|>', TokenType.PIPE],
      ['=>', TokenType.FAT_ARROW],
      ['+=', TokenType.PLUS_ASSIGN],
    ]);

    const twoCharCandidate = this.ch + (this.peekChar() || '');
    if (twoCharOperators.has(twoCharCandidate)) {
      const literal = twoCharCandidate;
      this.readChar();
      this.readChar();
      return createToken(twoCharOperators.get(literal)!, literal);
    }

    if (this.ch === '.' && this.peekChar() === '.' && this.input[this.readPosition + 1] === '.') {
      this.readChar();
      this.readChar();
      this.readChar();
      return createToken(TokenType.DOTDOTDOT, '...');
    }

    const singleCharOperators = new Map<string, TokenType>([
      ['=', TokenType.ASSIGN],
      [';', TokenType.SEMICOLON],
      [':', TokenType.COLON],
      ['(', TokenType.LPAREN],
      [')', TokenType.RPAREN],
      [',', TokenType.COMMA],
      ['+', TokenType.PLUS],
      ['-', TokenType.MINUS],
      ['!', TokenType.BANG],
      ['*', TokenType.ASTERISK],
      ['/', TokenType.SLASH],
      ['|', TokenType.BAR],
      ['%', TokenType.PERCENT],
      ['<', TokenType.LT],
      ['>', TokenType.GT],
      ['{', TokenType.LBRACE],
      ['}', TokenType.RBRACE],
      ['.', TokenType.DOT],
      ['[', TokenType.LBRACKET],
      [']', TokenType.RBRACKET],
      ['?', TokenType.QUESTION],
    ]);

    if (this.ch !== null && singleCharOperators.has(this.ch)) {
      const char = this.ch;
      this.readChar();
      return createToken(singleCharOperators.get(char)!, char);
    }

    if (this.isLetter(this.ch)) {
      const literal = this.readIdentifier();
      return createToken(lookupIdent(literal), literal);
    }

    if (this.isDigit(this.ch)) {
      const { literal, type } = this.readNumber();
      return createToken(type, literal);
    }

    if (this.ch === '"') {
      if (this.peekChar() === '"' && this.input[this.readPosition + 1] === '"') {
        const literal = this.readMultiLineString();
        return createToken(TokenType.STRING, literal);
      } else {
        this.readChar();
        const literal = this.readString();
        this.readChar();
        return createToken(TokenType.STRING, literal);
      }
    }

    const illegalToken = createToken(TokenType.ILLEGAL, this.ch);
    this.readChar();
    return illegalToken;
  }

  private readMultiLineString(): string {
    this.readChar();
    this.readChar();
    this.readChar();

    let out = '';
    while (true) {
      if (this.ch === null) {
        break;
      }
      if (this.ch === '"' && this.peekChar() === '"' && this.input[this.readPosition + 1] === '"') {
        this.readChar();
        this.readChar();
        this.readChar();
        break;
      }

      if (this.ch === '\n') {
        this.line++;
        this.column = 0;
      }

      out += this.ch;
      this.readChar();
    }
    return out;
  }

  private skipWhitespace(): void {
    while (
      this.ch === ' ' ||
      this.ch === '\t' ||
      this.ch === '\n' ||
      this.ch === '\r' ||
      this.ch === '\u00A0'
    ) {
      if (this.ch === '\n') {
        this.line++;
        this.column = 1;
      }
      this.readChar();
    }
  }

  private skipComment(): void {
    while (this.ch !== '\n' && this.ch !== null) {
      this.readChar();
    }
  }

  private readIdentifier(): string {
    const startPosition = this.position;
    while (this.ch && (this.isLetter(this.ch) || this.isDigit(this.ch))) {
      this.readChar();
    }
    return this.input.substring(startPosition, this.position);
  }

  private isLetter(ch: string | null): boolean {
    if (!ch) return false;
    return ('a' <= ch && ch <= 'z') || ('A' <= ch && ch <= 'Z') || ch === '_';
  }

  private readNumber(): { literal: string; type: TokenType } {
    const startPosition = this.position;
    while (this.ch && this.isDigit(this.ch)) {
      this.readChar();
    }

    if (this.ch === '.' && this.peekChar() && this.isDigit(this.peekChar())) {
      this.readChar();
      while (this.ch && this.isDigit(this.ch)) {
        this.readChar();
      }
      const literal = this.input.substring(startPosition, this.position);
      return { literal, type: TokenType.DOUBLE };
    }

    const literal = this.input.substring(startPosition, this.position);
    return { literal, type: TokenType.INT };
  }

  private isDigit(ch: string | null): boolean {
    if (!ch) return false;
    return '0' <= ch && ch <= '9';
  }

  private readString(): string {
    let out = '';
    while (true) {
      if (this.ch === '"' || this.ch === null) {
        break;
      }

      if (this.ch === '\\') {
        this.readChar();
        const nextChar = this.ch;

        if (nextChar === null) {
          out += '\\';
          break;
        }

        const escapeMap: { [key: string]: string } = {
          '"': '"',
          '\\': '\\',
          n: '\n',
          t: '\t',
          r: '\r',
        };

        out += escapeMap[nextChar] || '\\' + nextChar;
      } else {
        out += this.ch;
      }
      this.readChar();
    }
    return out;
  }
}
