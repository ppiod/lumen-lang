import { Lexer } from './lexer.js';
import { type Token, TokenType } from '@syntax/token.js';
import {
  Program,
  type Statement,
  LetStatement,
  Identifier,
  ReturnStatement,
  ExpressionStatement,
  type Expression,
  IntegerLiteral,
  DoubleLiteral,
  PrefixExpression,
  InfixExpression,
  BooleanLiteral,
  IfExpression,
  FunctionLiteral,
  CallExpression,
  StringLiteral,
  ArrayLiteral,
  IndexExpression,
  HashLiteral,
  type TypeNode,
  GenericTypeNode,
  BlockStatement,
  TypeVariantNode,
  TypeDeclarationStatement,
  MatchArm,
  MatchExpression,
  VariantPattern,
  FunctionTypeNode,
  MemberAccessExpression,
  ImplementationStatement,
  TraitDeclarationStatement,
  TraitMethodSignature,
  TypeParameterNode,
  WildcardPattern,
  type Pattern,
  ModuleStatement,
  UseStatement,
  PathIdentifier,
  ArrayPattern,
  PathTypeNode,
  TryExpression,
  TuplePattern,
  RecordDeclarationStatement,
  type RecordField,
  WhenExpression,
  WhenExpressionBranch,
  TupleLiteral,
  TupleTypeNode,
} from '@syntax/ast.js';

enum Precedence {
  LOWEST = 1,
  PIPE,
  ASSIGN,
  ANNOTATE,
  LOGICAL_OR,
  LOGICAL_AND,
  EQUALS,
  LESSGREATER,
  SUM,
  PRODUCT,
  PREFIX,
  CALL,
  INDEX,
  MEMBER,
  TRY,
}

const precedences: Partial<Record<TokenType, Precedence>> = {
  [TokenType.COLON]: Precedence.ANNOTATE,
  [TokenType.FAT_ARROW]: Precedence.ASSIGN,
  [TokenType.ASSIGN]: Precedence.ASSIGN,
  [TokenType.PLUS_ASSIGN]: Precedence.ASSIGN,
  [TokenType.PIPE]: Precedence.PIPE,
  [TokenType.EQ]: Precedence.EQUALS,
  [TokenType.NOT_EQ]: Precedence.EQUALS,
  [TokenType.OR]: Precedence.LOGICAL_OR,
  [TokenType.AND]: Precedence.LOGICAL_AND,
  [TokenType.LT]: Precedence.LESSGREATER,
  [TokenType.GT]: Precedence.LESSGREATER,
  [TokenType.GTE]: Precedence.LESSGREATER,
  [TokenType.LTE]: Precedence.LESSGREATER,
  [TokenType.PLUS]: Precedence.SUM,
  [TokenType.MINUS]: Precedence.SUM,
  [TokenType.SLASH]: Precedence.PRODUCT,
  [TokenType.ASTERISK]: Precedence.PRODUCT,
  [TokenType.PERCENT]: Precedence.PRODUCT,
  [TokenType.LPAREN]: Precedence.CALL,
  [TokenType.LBRACKET]: Precedence.INDEX,
  [TokenType.DOT]: Precedence.MEMBER,
  [TokenType.QUESTION]: Precedence.TRY,
};

type prefixParseFn = () => Expression | undefined;
type infixParseFn = (expression: Expression) => Expression | undefined;

export class Parser {
  private lexer: Lexer;
  private curToken: Token;
  private peekToken: Token;
  public errors: string[] = [];
  private prefixParseFns: Partial<Record<TokenType, prefixParseFn>>;
  private infixParseFns: Partial<Record<TokenType, infixParseFn>>;

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    this.curToken = { type: TokenType.ILLEGAL, literal: '', line: 0, column: 0 };
    this.peekToken = { type: TokenType.ILLEGAL, literal: '', line: 0, column: 0 };

    this.prefixParseFns = {};
    this.registerPrefix(TokenType.IDENT, this.parseIdentifier.bind(this));
    this.registerPrefix(TokenType.MATCH, this.parseMatchExpression.bind(this));
    this.prefixParseFns[TokenType.WHEN] = this.parseWhenExpression.bind(this);
    this.registerPrefix(TokenType.INT, this.parseIntegerLiteral.bind(this));
    this.registerPrefix(TokenType.DOUBLE, this.parseDoubleLiteral.bind(this));
    this.registerPrefix(TokenType.STRING, this.parseStringLiteral.bind(this));
    this.registerPrefix(TokenType.BANG, this.parsePrefixExpression.bind(this));
    this.registerPrefix(TokenType.MINUS, this.parsePrefixExpression.bind(this));
    this.registerPrefix(TokenType.TRUE, this.parseBooleanLiteral.bind(this));
    this.registerPrefix(TokenType.FALSE, this.parseBooleanLiteral.bind(this));
    this.registerPrefix(TokenType.IF, this.parseIfExpression.bind(this));
    this.registerPrefix(TokenType.FUNCTION, this.parseFunctionLiteral.bind(this));
    this.registerPrefix(TokenType.LPAREN, this.parseGroupedExpression.bind(this));
    this.registerPrefix(TokenType.LBRACKET, this.parseArrayLiteral.bind(this));
    this.registerPrefix(TokenType.LBRACE, this.parseHashLiteral.bind(this));

    this.infixParseFns = {};
    this.registerInfix(TokenType.COLON, this.parseTypeAnnotationExpression.bind(this));
    this.registerInfix(TokenType.FAT_ARROW, this.parseLambdaExpression.bind(this));
    this.registerInfix(TokenType.ASSIGN, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.PLUS_ASSIGN, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.PIPE, this.parsePipeExpression.bind(this));
    this.registerInfix(TokenType.AND, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.OR, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.PLUS, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.MINUS, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.SLASH, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.ASTERISK, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.QUESTION, this.parseTryExpression.bind(this));
    this.registerInfix(TokenType.PERCENT, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.EQ, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.NOT_EQ, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LT, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.GT, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.GTE, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LTE, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LPAREN, this.parseCallExpression.bind(this));
    this.registerInfix(TokenType.LBRACKET, this.parseIndexExpression.bind(this));
    this.registerInfix(TokenType.DOT, this.parseMemberAccessExpression.bind(this));

    this.nextToken();
    this.nextToken();
  }

  private nextToken(): void {
    this.curToken = this.peekToken;
    this.peekToken = this.lexer.nextToken();
  }

  public parseProgram(): Program {
    const program = new Program();
    while (!this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt) {
        program.statements.push(stmt);
      }
      this.nextToken();
    }
    if (program.statements.length > 0) {
      program.token = program.statements[0].token;
    }
    return program;
  }

  private parseStatement(): Statement | undefined {
    switch (this.curToken.type) {
      case TokenType.SEMICOLON:
        return undefined;
      case TokenType.MODULE:
        return this.parseModuleStatement();
      case TokenType.USE:
        return this.parseUseStatement();
      case TokenType.LET:
        return this.parseLetStatement();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.TYPE:
        return this.parseTypeDeclarationStatement();
      case TokenType.RECORD:
        return this.parseRecordDeclarationStatement();
      case TokenType.TRAIT:
        return this.parseTraitDeclarationStatement();
      case TokenType.IMPL:
        return this.parseImplementationStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseExpressionStatement(): ExpressionStatement | undefined {
    const expression = this.parseExpression(Precedence.LOWEST);
    if (!expression) return undefined;

    const stmt = new ExpressionStatement(expression.token, expression);

    if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();

    return stmt;
  }

  private parseExpression(precedence: Precedence): Expression | undefined {
    const prefix = this.prefixParseFns[this.curToken.type];
    if (!prefix) {
      this.noPrefixParseFnError();
      return undefined;
    }
    let leftExp = prefix();
    if (!leftExp) return undefined;
    while (!this.peekTokenIs(TokenType.SEMICOLON) && precedence < this.peekPrecedence()) {
      const infix = this.infixParseFns[this.peekToken.type];
      if (!infix) return leftExp;
      this.nextToken();
      const newLeftExp = infix(leftExp);
      if (!newLeftExp) return undefined;
      leftExp = newLeftExp;
    }
    return leftExp;
  }

  private parseHashLiteral(): Expression | undefined {
    const hash = new HashLiteral(this.curToken);

    while (!this.peekTokenIs(TokenType.RBRACE)) {
      this.nextToken();

      const key = this.parseExpression(Precedence.ANNOTATE);
      if (!key) {
        return undefined;
      }

      if (!this.expectPeek(TokenType.COLON)) {
        return undefined;
      }

      this.nextToken();
      const value = this.parseExpression(Precedence.LOWEST);
      if (!value) {
        return undefined;
      }

      hash.pairs.set(key, value);

      if (!this.peekTokenIs(TokenType.RBRACE) && !this.expectPeek(TokenType.COMMA)) {
        return undefined;
      }
    }

    if (!this.expectPeek(TokenType.RBRACE)) {
      return undefined;
    }

    return hash;
  }

  private parseModuleStatement(): ModuleStatement | undefined {
    const stmtToken = this.curToken;

    if (!this.expectPeek(TokenType.IDENT)) {
      return undefined;
    }

    const name = this.parsePathIdentifier();
    if (!name) {
      return undefined;
    }

    const exposing: Identifier[] = [];
    if (this.peekTokenIs(TokenType.EXPOSING)) {
      this.nextToken();

      if (!this.expectPeek(TokenType.LPAREN)) {
        return undefined;
      }
      this.nextToken();

      if (!this.curTokenIs(TokenType.RPAREN)) {
        exposing.push(new Identifier(this.curToken, this.curToken.literal));
        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
          if (!this.expectPeek(TokenType.IDENT)) {
            return undefined;
          }
          exposing.push(new Identifier(this.curToken, this.curToken.literal));
        }
      }

      if (!this.expectPeek(TokenType.RPAREN)) {
        return undefined;
      }
    }

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }

    return new ModuleStatement(stmtToken, name, exposing);
  }

  private parseUseStatement(): UseStatement | undefined {
    const stmtToken = this.curToken;

    if (!this.expectPeek(TokenType.IDENT)) {
      return undefined;
    }

    const path = this.parsePathIdentifier();
    if (!path) {
      return undefined;
    }

    let alias: Identifier | null = null;
    let exposing: Identifier[] | null = null;

    if (this.peekTokenIs(TokenType.AS)) {
      this.nextToken();
      if (!this.expectPeek(TokenType.IDENT)) {
        this.errors.push(`Expected an alias identifier after 'as'`);
        return undefined;
      }
      alias = new Identifier(this.curToken, this.curToken.literal);
    }
    if (this.peekTokenIs(TokenType.LPAREN)) {
      if (alias) {
        this.errors.push(`Cannot use 'as' and an exposing list '(...)' at the same time.`);
        return undefined;
      }

      this.nextToken();
      exposing = [];

      if (!this.peekTokenIs(TokenType.RPAREN)) {
        this.nextToken();
        if (!this.curTokenIs(TokenType.IDENT)) {
          this.errors.push(`expected identifier in import list, got ${this.curToken.type}`);
          return undefined;
        }
        exposing.push(new Identifier(this.curToken, this.curToken.literal));

        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
          this.nextToken();
          if (!this.curTokenIs(TokenType.IDENT)) {
            this.errors.push(`expected identifier in import list, got ${this.curToken.type}`);
            return undefined;
          }
          exposing.push(new Identifier(this.curToken, this.curToken.literal));
        }
      }

      if (!this.expectPeek(TokenType.RPAREN)) {
        return undefined;
      }
    }

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }

    return new UseStatement(stmtToken, path, alias, exposing);
  }

  private parseLetStatement(): LetStatement | undefined {
    const stmtToken = this.curToken;

    let isMutable = false;
    if (this.peekTokenIs(TokenType.MUT)) {
      isMutable = true;
      this.nextToken();
    }

    this.nextToken();

    const name = this.parsePattern();
    if (!name) {
      this.errors.push(`Expected an identifier or a pattern on the left side of a let statement.`);
      return undefined;
    }

    let typeAnnotation: TypeNode | undefined = undefined;
    if (this.peekTokenIs(TokenType.COLON)) {
      if (!(name instanceof Identifier)) {
        this.errors.push('Type annotations are not supported for destructuring assignment yet.');
        return undefined;
      }
      this.nextToken();
      this.nextToken();
      typeAnnotation = this.parseTypeNode();
      if (!typeAnnotation) return undefined;
    }

    if (!this.expectPeek(TokenType.ASSIGN)) return undefined;
    this.nextToken();

    const value = this.parseExpression(Precedence.LOWEST);
    if (!value) return undefined;

    if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();

    return new LetStatement(stmtToken, name, value, isMutable, typeAnnotation);
  }

  private parseReturnStatement(): ReturnStatement | undefined {
    const stmtToken = this.curToken;
    this.nextToken();
    const returnValue = this.parseExpression(Precedence.LOWEST);
    if (!returnValue) return undefined;

    if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();

    return new ReturnStatement(stmtToken, returnValue);
  }

  private parseTypeDeclarationStatement(): Statement | undefined {
    const stmtToken = this.curToken;
    if (!this.expectPeek(TokenType.IDENT)) return undefined;
    const name = new Identifier(this.curToken, this.curToken.literal);
    const typeParameters: Identifier[] = [];
    if (this.peekTokenIs(TokenType.LT)) {
      this.nextToken();
      this.nextToken();
      while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
        typeParameters.push(new Identifier(this.curToken, this.curToken.literal));
        if (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
        }
        this.nextToken();
      }
      if (!this.curTokenIs(TokenType.GT)) return undefined;
    }
    if (!this.expectPeek(TokenType.ASSIGN)) return undefined;
    this.nextToken();
    const variants: TypeVariantNode[] = [];
    if (this.curTokenIs(TokenType.BAR)) {
      this.nextToken();
    }
    const parseVariant = (): TypeVariantNode | undefined => {
      const variantToken = this.curToken;
      if (!this.curTokenIs(TokenType.IDENT)) return undefined;
      const variantName = new Identifier(this.curToken, this.curToken.literal);
      if (!this.expectPeek(TokenType.LPAREN)) return undefined;
      const variantParams: TypeNode[] = [];
      if (!this.peekTokenIs(TokenType.RPAREN)) {
        this.nextToken();
        const firstParam = this.parseTypeNode();
        if (firstParam) variantParams.push(firstParam);
        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
          this.nextToken();
          const nextParam = this.parseTypeNode();
          if (nextParam) variantParams.push(nextParam);
        }
      }
      if (!this.expectPeek(TokenType.RPAREN)) return undefined;
      return new TypeVariantNode(variantToken, variantName, variantParams);
    };
    const firstVariant = parseVariant();
    if (!firstVariant) return undefined;
    variants.push(firstVariant);
    while (this.peekTokenIs(TokenType.BAR)) {
      this.nextToken();
      this.nextToken();
      const nextVariant = parseVariant();
      if (!nextVariant) return undefined;
      variants.push(nextVariant);
    }
    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }
    return new TypeDeclarationStatement(stmtToken, name, typeParameters, variants);
  }

  private parseRecordDeclarationStatement(): Statement | undefined {
    const stmtToken = this.curToken;
    if (!this.expectPeek(TokenType.IDENT)) return undefined;

    const name = new Identifier(this.curToken, this.curToken.literal);

    const typeParameters: Identifier[] = [];
    if (this.peekTokenIs(TokenType.LT)) {
      this.nextToken();
      this.nextToken();

      while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
        typeParameters.push(new Identifier(this.curToken, this.curToken.literal));
        if (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
        }
        this.nextToken();
      }
      if (!this.curTokenIs(TokenType.GT)) return undefined;
    }

    if (!this.expectPeek(TokenType.LPAREN)) return undefined;

    const fields: RecordField[] = [];
    if (!this.peekTokenIs(TokenType.RPAREN)) {
      this.nextToken();

      let fieldName = new Identifier(this.curToken, this.curToken.literal);
      if (!this.expectPeek(TokenType.COLON)) return undefined;
      this.nextToken();
      let fieldType = this.parseTypeNode();
      if (!fieldType) return undefined;
      fields.push({
        name: fieldName,
        type: fieldType,
        token: fieldName.token,
        tokenLiteral: () => fieldName.tokenLiteral(),
        toString: () => '',
      });

      while (this.peekTokenIs(TokenType.COMMA)) {
        this.nextToken();
        this.nextToken();

        fieldName = new Identifier(this.curToken, this.curToken.literal);
        if (!this.expectPeek(TokenType.COLON)) return undefined;
        this.nextToken();
        fieldType = this.parseTypeNode();
        if (!fieldType) return undefined;
        fields.push({
          name: fieldName,
          type: fieldType,
          token: fieldName.token,
          tokenLiteral: () => fieldName.tokenLiteral(),
          toString: () => '',
        });
      }
    }

    if (!this.expectPeek(TokenType.RPAREN)) return undefined;

    return new RecordDeclarationStatement(stmtToken, name, fields, typeParameters);
  }

  private parseTraitDeclarationStatement(): Statement | undefined {
    const stmtToken = this.curToken;
    if (!this.expectPeek(TokenType.IDENT)) return undefined;

    const name = new Identifier(this.curToken, this.curToken.literal);

    const typeParameters: Identifier[] = [];
    if (this.peekTokenIs(TokenType.LT)) {
      this.nextToken();
      this.nextToken();
      while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
        typeParameters.push(new Identifier(this.curToken, this.curToken.literal));
        if (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
        }
        this.nextToken();
      }
      if (!this.curTokenIs(TokenType.GT)) return undefined;
    }

    if (!this.expectPeek(TokenType.LBRACE)) return undefined;

    const methods: TraitMethodSignature[] = [];
    while (!this.peekTokenIs(TokenType.RBRACE) && !this.peekTokenIs(TokenType.EOF)) {
      this.nextToken();
      if (!this.curTokenIs(TokenType.FUNCTION)) return undefined;
      const fnToken = this.curToken;

      if (!this.expectPeek(TokenType.IDENT)) return undefined;
      const methodName = new Identifier(this.curToken, this.curToken.literal);

      if (!this.expectPeek(TokenType.LPAREN)) return undefined;
      const parameters = this.parseFunctionParameters();
      if (!parameters) return undefined;

      if (!this.expectPeek(TokenType.ARROW)) return undefined;
      this.nextToken();
      const returnType = this.parseTypeNode();
      if (!returnType) return undefined;

      if (this.peekTokenIs(TokenType.SEMICOLON)) this.nextToken();

      methods.push(new TraitMethodSignature(fnToken, methodName, parameters, returnType));
    }

    if (!this.expectPeek(TokenType.RBRACE)) return undefined;

    return new TraitDeclarationStatement(stmtToken, name, methods, typeParameters);
  }

  private parseImplementationStatement(): Statement | undefined {
    const stmtToken = this.curToken;

    let typeParameters: TypeParameterNode[] | undefined = undefined;
    if (this.peekTokenIs(TokenType.LT)) {
      this.nextToken();
      this.nextToken();

      typeParameters = [];
      while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
        const paramToken = this.curToken;
        const paramName = new Identifier(this.curToken, this.curToken.literal);
        const bounds: TypeNode[] = [];

        if (this.peekTokenIs(TokenType.COLON)) {
          this.nextToken();
          this.nextToken();
          const firstBound = this.parseTypeNode();
          if (!firstBound) return undefined;
          bounds.push(firstBound);
          while (this.peekTokenIs(TokenType.PLUS)) {
            this.nextToken();
            this.nextToken();
            const nextBound = this.parseTypeNode();
            if (!nextBound) return undefined;
            bounds.push(nextBound);
          }
        }
        typeParameters.push(new TypeParameterNode(paramToken, paramName, bounds));
        if (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
        }
        this.nextToken();
      }
      if (!this.curTokenIs(TokenType.GT)) return undefined;
    }

    if (!this.expectPeek(TokenType.IDENT)) return undefined;

    const trait = this.parseTypeNode();
    if (!trait) return undefined;

    if (!this.expectPeek(TokenType.FOR)) {
      this.errors.push("expected 'for' after trait name in impl statement");
      return undefined;
    }

    this.nextToken();
    const targetType = this.parseTypeNode();
    if (!targetType) return undefined;

    if (!this.expectPeek(TokenType.LBRACE)) return undefined;

    const methods: FunctionLiteral[] = [];
    while (!this.peekTokenIs(TokenType.RBRACE) && !this.peekTokenIs(TokenType.EOF)) {
      this.nextToken();
      if (this.curTokenIs(TokenType.FUNCTION)) {
        const method = this.parseFunctionLiteral();
        if (method) {
          methods.push(method as FunctionLiteral);
        }
      }
    }

    if (!this.expectPeek(TokenType.RBRACE)) return undefined;

    return new ImplementationStatement(stmtToken, trait, targetType, methods, typeParameters);
  }

  private parseIdentifier(): Expression {
    return new Identifier(this.curToken, this.curToken.literal);
  }

  private parseIntegerLiteral(): Expression | undefined {
    const token = this.curToken;
    const value = parseInt(token.literal, 10);
    if (isNaN(value)) {
      this.errors.push(`could not parse ${token.literal} as integer`);
      return undefined;
    }
    return new IntegerLiteral(token, value);
  }

  private parseDoubleLiteral(): Expression | undefined {
    const token = this.curToken;
    const value = parseFloat(token.literal);
    if (isNaN(value)) {
      this.errors.push(`could not parse ${token.literal} as double`);
      return undefined;
    }
    return new DoubleLiteral(token, value);
  }

  private parseStringLiteral(): Expression {
    return new StringLiteral(this.curToken, this.curToken.literal);
  }

  private parseBooleanLiteral(): Expression {
    return new BooleanLiteral(this.curToken, this.curTokenIs(TokenType.TRUE));
  }

  private parseArrayLiteral(): Expression | undefined {
    const token = this.curToken;
    const elements = this.parseExpressionList(TokenType.RBRACKET);
    if (!elements) return undefined;
    return new ArrayLiteral(token, elements);
  }

  private parsePrefixExpression(): Expression | undefined {
    const token = this.curToken;
    const operator = this.curToken.literal;
    this.nextToken();
    const right = this.parseExpression(Precedence.PREFIX);
    if (!right) return undefined;
    return new PrefixExpression(token, operator, right);
  }

  private parseInfixExpression(left: Expression): Expression | undefined {
    const token = this.curToken;
    const operator = this.curToken.literal;
    const precedence = this.curPrecedence();
    this.nextToken();
    const right = this.parseExpression(precedence);
    if (!right) return undefined;
    return new InfixExpression(token, left, operator, right);
  }

  private parsePipeExpression(left: Expression): Expression | undefined {
    const precedence = this.curPrecedence();
    const token = this.curToken;
    this.nextToken();
    const right = this.parseExpression(precedence);
    if (!right) {
      return undefined;
    }

    if (right instanceof Identifier || right instanceof MemberAccessExpression) {
      return new CallExpression(right.token, right, [left]);
    } else if (right instanceof CallExpression) {
      const newArgs = [left, ...right.args];
      return new CallExpression(right.token, right.func, newArgs);
    } else if (right instanceof FunctionLiteral) {
      return new CallExpression(token, right, [left]);
    } else {
      this.errors.push(
        `The right-hand side of a pipe operator must be a function call, but got ${right.constructor.name}`,
      );
      return undefined;
    }
  }

  private parseGroupedExpression(): Expression | undefined {
    const token = this.curToken;
    this.nextToken();

    if (this.curTokenIs(TokenType.RPAREN)) {
      return new TupleLiteral(token, []);
    }

    const exp = this.parseExpression(Precedence.LOWEST);
    if (!exp) return undefined;

    if (this.peekTokenIs(TokenType.COMMA)) {
      const elements = [exp];
      while (this.peekTokenIs(TokenType.COMMA)) {
        this.nextToken();
        this.nextToken();
        const nextExp = this.parseExpression(Precedence.LOWEST);
        if (nextExp) {
          elements.push(nextExp);
        }
      }
      if (!this.expectPeek(TokenType.RPAREN)) return undefined;
      return new TupleLiteral(token, elements);
    }

    if (!this.expectPeek(TokenType.RPAREN)) {
      return undefined;
    }
    return exp;
  }

  private parseIfExpression(): Expression | undefined {
    const token = this.curToken;

    this.nextToken();
    const condition = this.parseExpression(Precedence.ANNOTATE);
    if (!condition) {
      this.errors.push('Expected a condition after "if".');
      return undefined;
    }

    let consequence: Expression | BlockStatement | undefined;

    if (this.peekTokenIs(TokenType.COLON)) {
      this.nextToken();
      this.nextToken();
      consequence = this.parseExpression(Precedence.LOWEST);
    } else if (this.peekTokenIs(TokenType.LBRACE)) {
      this.nextToken();
      consequence = this.parseBlockStatement();
    } else {
      this.peekError(TokenType.COLON);
      return undefined;
    }

    if (!consequence) {
      return undefined;
    }

    let alternative: Expression | BlockStatement | undefined = undefined;
    if (this.peekTokenIs(TokenType.ELSE)) {
      this.nextToken();

      if (this.peekTokenIs(TokenType.COLON)) {
        this.nextToken();
        this.nextToken();
        alternative = this.parseExpression(Precedence.LOWEST);
      } else if (this.peekTokenIs(TokenType.LBRACE)) {
        this.nextToken();
        alternative = this.parseBlockStatement();
      } else if (this.peekTokenIs(TokenType.IF)) {
        this.nextToken();
        alternative = this.parseIfExpression();
      } else {
        this.peekError(TokenType.COLON);
        return undefined;
      }
    }

    return new IfExpression(token, condition, consequence, alternative);
  }

  private parseMatchExpression(): Expression | undefined {
    const token = this.curToken;
    const values: Expression[] = [];

    if (this.peekTokenIs(TokenType.LPAREN)) {
      this.nextToken();
      const expressions = this.parseExpressionList(TokenType.RPAREN);
      if (!expressions) return undefined;
      values.push(...expressions);
    } else {
      this.nextToken();
      const value = this.parseExpression(Precedence.LOWEST);
      if (!value) return undefined;
      values.push(value);
    }

    const match = new MatchExpression(token, values);

    if (!this.expectPeek(TokenType.LBRACE)) return undefined;

    while (!this.peekTokenIs(TokenType.RBRACE) && !this.peekTokenIs(TokenType.EOF)) {
      this.nextToken();
      const pattern = this.parsePattern();
      if (!pattern) return undefined;
      if (!this.expectPeek(TokenType.FAT_ARROW)) return undefined;
      const armToken = this.curToken;
      this.nextToken();

      let body: Expression | BlockStatement | undefined;
      if (this.curTokenIs(TokenType.LBRACE)) {
        body = this.parseBlockStatement();
      } else {
        body = this.parseExpression(Precedence.LOWEST);
      }

      if (!body) return undefined;
      match.arms.push(new MatchArm(armToken, pattern, body));

      if (!this.peekTokenIs(TokenType.RBRACE) && !this.expectPeek(TokenType.COMMA)) {
        return undefined;
      }
    }
    if (!this.expectPeek(TokenType.RBRACE)) return undefined;
    return match;
  }

  private parseWhenExpression(): Expression | undefined {
    const whenToken = this.curToken;
    let subject: Expression | undefined = undefined;

    if (this.peekTokenIs(TokenType.LPAREN)) {
      this.nextToken();
      this.nextToken();
      subject = this.parseExpression(Precedence.LOWEST);
      if (!this.expectPeek(TokenType.RPAREN)) return undefined;
    }

    if (!this.expectPeek(TokenType.LBRACE)) return undefined;

    const branches: WhenExpressionBranch[] = [];
    let elseBody: Expression | undefined = undefined;

    while (!this.peekTokenIs(TokenType.RBRACE) && !this.peekTokenIs(TokenType.EOF)) {
      this.nextToken();

      if (this.curTokenIs(TokenType.ELSE)) {
        if (elseBody) {
          this.errors.push('when can only have one else branch');
          return undefined;
        }
        if (!this.expectPeek(TokenType.FAT_ARROW)) return undefined;
        this.nextToken();
        elseBody = this.curTokenIs(TokenType.LBRACE)
          ? this.parseBlockStatement()
          : this.parseExpression(Precedence.LOWEST);
        if (!elseBody) return undefined;
      } else if (this.curTokenIs(TokenType.BAR)) {
        this.nextToken();
        const patterns: Expression[] = [];
        const firstPattern = this.parseExpression(Precedence.ASSIGN);
        if (!firstPattern) return undefined;
        patterns.push(firstPattern);

        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
          this.nextToken();
          const nextPattern = this.parseExpression(Precedence.ASSIGN);
          if (!nextPattern) return undefined;
          patterns.push(nextPattern);
        }

        if (!this.expectPeek(TokenType.FAT_ARROW)) return undefined;
        this.nextToken();
        const body = this.curTokenIs(TokenType.LBRACE)
          ? this.parseBlockStatement()
          : this.parseExpression(Precedence.LOWEST);
        if (!body) return undefined;
        branches.push(new WhenExpressionBranch(patterns, body));
      } else {
        this.errors.push(`unexpected token in when expression: ${this.curToken.literal}`);
        return undefined;
      }

      if (this.peekTokenIs(TokenType.COMMA) && !this.peekTokenIs(TokenType.RBRACE)) {
        this.nextToken();
      }
    }

    if (!this.expectPeek(TokenType.RBRACE)) return undefined;
    if (!elseBody) {
      this.errors.push('when must have an else branch');
      return undefined;
    }

    return new WhenExpression(whenToken, subject || null, branches, elseBody!);
  }

  private parseFunctionLiteral(): Expression | undefined {
    const token = this.curToken;

    let name: Identifier | null = null;
    if (this.peekTokenIs(TokenType.IDENT)) {
      this.nextToken();
      name = new Identifier(this.curToken, this.curToken.literal);
    }

    let typeParameters: TypeParameterNode[] | undefined = undefined;
    if (this.peekTokenIs(TokenType.LT)) {
      this.nextToken();
      this.nextToken();

      typeParameters = [];
      while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
        const paramToken = this.curToken;
        const paramName = new Identifier(this.curToken, this.curToken.literal);
        const bounds: TypeNode[] = [];

        if (this.peekTokenIs(TokenType.COLON)) {
          this.nextToken();
          this.nextToken();
          const firstBound = this.parseTypeNode();
          if (!firstBound) return undefined;
          bounds.push(firstBound);
          while (this.peekTokenIs(TokenType.PLUS)) {
            this.nextToken();
            this.nextToken();
            const nextBound = this.parseTypeNode();
            if (!nextBound) return undefined;
            bounds.push(nextBound);
          }
        }
        typeParameters.push(new TypeParameterNode(paramToken, paramName, bounds));
        if (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken();
        }
        this.nextToken();
      }
      if (!this.curTokenIs(TokenType.GT)) return undefined;
    }

    if (!this.expectPeek(TokenType.LPAREN)) return undefined;
    const parameters = this.parseFunctionParameters();
    if (!parameters) return undefined;

    let returnType: TypeNode | undefined = undefined;
    if (this.peekTokenIs(TokenType.ARROW)) {
      this.nextToken();
      this.nextToken();
      returnType = this.parseTypeNode();
      if (!returnType) return undefined;
    }

    let body: Expression | BlockStatement | undefined = undefined;
    if (this.peekTokenIs(TokenType.COLON) || this.peekTokenIs(TokenType.FAT_ARROW)) {
      this.nextToken();
      this.nextToken();
      body = this.parseExpression(Precedence.LOWEST);
    } else if (this.peekTokenIs(TokenType.LBRACE)) {
      this.nextToken();
      body = this.parseBlockStatement();
    } else {
      this.errors.push(`expected ':', '=>' or '{' for function body, got ${this.peekToken.type}`);
      return undefined;
    }

    if (!body) return undefined;

    return new FunctionLiteral(token, name, parameters, body, returnType, typeParameters);
  }

  private parseLambdaExpression(left: Expression): Expression | undefined {
    const token = this.curToken;

    const parameters: Identifier[] = [];
    if (left instanceof Identifier) {
      parameters.push(left);
    } else if (left instanceof TupleLiteral) {
      for (const arg of left.elements) {
        if (arg instanceof Identifier) {
          parameters.push(arg);
        } else {
          this.errors.push(
            `Invalid non-identifier parameter in lambda expression: ${arg.toString()}`,
          );
          return undefined;
        }
      }
    } else {
      this.errors.push(
        `Invalid parameter list for lambda expression. Use a single identifier or a group like (a, b).`,
      );
      return undefined;
    }

    this.nextToken();

    let body: Expression | BlockStatement | undefined;

    if (this.curTokenIs(TokenType.LBRACE)) {
      body = this.parseBlockStatement();
    } else {
      body = this.parseExpression(Precedence.ASSIGN);
    }

    if (!body) return undefined;

    return new FunctionLiteral(token, null, parameters, body);
  }

  private parseCallExpression(func: Expression): Expression | undefined {
    const token = this.curToken;
    const args = this.parseExpressionList(TokenType.RPAREN);
    if (!args) return undefined;
    return new CallExpression(token, func, args);
  }

  private parseIndexExpression(left: Expression): Expression | undefined {
    const token = this.curToken;
    this.nextToken();
    const index = this.parseExpression(Precedence.LOWEST);
    if (!index) return undefined;
    if (!this.expectPeek(TokenType.RBRACKET)) return undefined;
    return new IndexExpression(token, left, index);
  }

  private parseMemberAccessExpression(object: Expression): Expression | undefined {
    const token = this.curToken;
    this.curPrecedence();
    this.nextToken();
    if (!this.curTokenIs(TokenType.IDENT)) {
      this.errors.push(`Expected identifier after '.', got ${this.curToken.type}`);
      return undefined;
    }
    const property = this.parseIdentifier() as Identifier;
    return new MemberAccessExpression(token, object, property);
  }

  private parseTryExpression(left: Expression): Expression | undefined {
    return new TryExpression(this.curToken, left);
  }

  private parseBlockStatement(): BlockStatement | undefined {
    const block = new BlockStatement(this.curToken);
    this.nextToken();
    while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt) {
        block.statements.push(stmt);
      }
      this.nextToken();
    }
    return block;
  }

  private parseFunctionParameters(): Identifier[] | undefined {
    const identifiers: Identifier[] = [];
    if (this.peekTokenIs(TokenType.RPAREN)) {
      this.nextToken();
      return identifiers;
    }
    this.nextToken();
    let identToken = this.curToken;
    if (!this.curTokenIs(TokenType.IDENT)) return undefined;
    let typeAnnotation: TypeNode | undefined = undefined;
    if (this.peekTokenIs(TokenType.COLON)) {
      this.nextToken();
      this.nextToken();
      typeAnnotation = this.parseTypeNode();
      if (!typeAnnotation) return undefined;
    }
    identifiers.push(new Identifier(identToken, identToken.literal, typeAnnotation));
    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken();
      this.nextToken();
      identToken = this.curToken;
      if (!this.curTokenIs(TokenType.IDENT)) return undefined;
      typeAnnotation = undefined;
      if (this.peekTokenIs(TokenType.COLON)) {
        this.nextToken();
        this.nextToken();
        typeAnnotation = this.parseTypeNode();
        if (!typeAnnotation) return undefined;
      }
      identifiers.push(new Identifier(identToken, identToken.literal, typeAnnotation));
    }
    if (!this.expectPeek(TokenType.RPAREN)) return undefined;
    return identifiers;
  }

  private parseExpressionList(end: TokenType): Expression[] | undefined {
    const list: Expression[] = [];
    if (this.peekTokenIs(end)) {
      this.nextToken();
      return list;
    }
    this.nextToken();
    const exp = this.parseExpression(Precedence.LOWEST);
    if (exp) list.push(exp);
    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken();
      this.nextToken();
      const nextExp = this.parseExpression(Precedence.LOWEST);
      if (nextExp) list.push(nextExp);
    }
    if (!this.expectPeek(end)) return undefined;
    return list;
  }

  private parsePathIdentifier(): PathIdentifier | undefined {
    const ident = new Identifier(this.curToken, this.curToken.literal);
    const path = new PathIdentifier(this.curToken, [ident]);

    while (this.peekTokenIs(TokenType.DOT)) {
      this.nextToken();
      if (!this.expectPeek(TokenType.IDENT)) {
        return undefined;
      }
      path.parts.push(new Identifier(this.curToken, this.curToken.literal));
    }
    return path;
  }

  private parsePattern(): Pattern | undefined {
    if (this.curTokenIs(TokenType.LPAREN)) {
      const token = this.curToken;
      const patterns: Pattern[] = [];
      if (this.peekTokenIs(TokenType.RPAREN)) {
        this.nextToken();
        return new TuplePattern(token, []);
      }
      this.nextToken();
      let pat = this.parsePattern();
      if (pat) patterns.push(pat);
      while (this.peekTokenIs(TokenType.COMMA)) {
        this.nextToken();
        this.nextToken();
        pat = this.parsePattern();
        if (pat) patterns.push(pat);
      }
      if (!this.expectPeek(TokenType.RPAREN)) return undefined;
      return new TuplePattern(token, patterns);
    }

    if (this.curTokenIs(TokenType.IDENT)) {
      if (this.curToken.literal === '_') {
        return new WildcardPattern(this.curToken);
      }

      const path = this.parseIdentifier() as Identifier;
      if (this.peekTokenIs(TokenType.LPAREN)) {
        this.nextToken();
        const parameters: Identifier[] = [];
        if (!this.peekTokenIs(TokenType.RPAREN)) {
          this.nextToken();
          parameters.push(this.parseIdentifier() as Identifier);
          while (this.peekTokenIs(TokenType.COMMA)) {
            this.nextToken();
            this.nextToken();
            parameters.push(this.parseIdentifier() as Identifier);
          }
        }
        if (!this.expectPeek(TokenType.RPAREN)) return undefined;
        return new VariantPattern(path.token, path, parameters);
      }

      return path;
    }

    if (this.curTokenIs(TokenType.LBRACKET)) {
      return this.parseArrayPattern();
    }

    const literalExpr = this.parseExpression(Precedence.LOWEST);
    if (literalExpr) {
      return literalExpr as Expression;
    }

    this.errors.push(`Unexpected token in pattern: ${this.curToken.type}`);
    return undefined;
  }

  private parseArrayPattern(): Pattern | undefined {
    const token = this.curToken;
    const elements: Identifier[] = [];
    let rest: Identifier | undefined = undefined;

    if (this.peekTokenIs(TokenType.RBRACKET)) {
      this.nextToken();
      return new ArrayPattern(token, elements, rest);
    }

    this.nextToken();

    if (this.curTokenIs(TokenType.IDENT)) {
      elements.push(this.parseIdentifier() as Identifier);
    }

    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken();
      this.nextToken();

      if (this.curTokenIs(TokenType.DOTDOTDOT)) {
        this.nextToken();
        if (!this.curTokenIs(TokenType.IDENT)) {
          this.errors.push("Expected identifier after '...' in array pattern");
          return undefined;
        }
        rest = this.parseIdentifier() as Identifier;
        break;
      }

      if (!this.curTokenIs(TokenType.IDENT)) {
        this.errors.push('Expected identifier in array pattern');
        return undefined;
      }
      elements.push(this.parseIdentifier() as Identifier);
    }

    if (this.peekTokenIs(TokenType.DOTDOTDOT)) {
      this.nextToken();
      this.nextToken();
      if (!this.curTokenIs(TokenType.IDENT)) {
        this.errors.push("Expected identifier after '...' in array pattern");
        return undefined;
      }
      rest = this.parseIdentifier() as Identifier;
    }

    if (!this.expectPeek(TokenType.RBRACKET)) return undefined;

    return new ArrayPattern(token, elements, rest);
  }

  private parseTypeNode(): TypeNode | undefined {
    if (this.curTokenIs(TokenType.LPAREN)) {
      const token = this.curToken;
      const elementTypes: TypeNode[] = [];

      if (this.peekTokenIs(TokenType.RPAREN)) {
        this.nextToken();
        return new TupleTypeNode(token, []);
      }

      this.nextToken();

      const firstType = this.parseTypeNode();
      if (!firstType) return undefined;
      elementTypes.push(firstType);

      while (this.peekTokenIs(TokenType.COMMA)) {
        this.nextToken();
        this.nextToken();
        const nextType = this.parseTypeNode();
        if (!nextType) return undefined;
        elementTypes.push(nextType);
      }

      if (!this.expectPeek(TokenType.RPAREN)) {
        this.errors.push(`Expected ')' to close tuple type, got ${this.peekToken.type}`);
        return undefined;
      }

      return new TupleTypeNode(token, elementTypes);
    }

    if (this.curTokenIs(TokenType.FUNCTION)) {
      return this.parseFunctionTypeNode();
    }
    if (!this.curTokenIs(TokenType.IDENT)) {
      this.errors.push(`expected a type name, got ${this.curToken.type} instead`);
      return undefined;
    }

    const path = this.parsePathIdentifier();
    if (!path) {
      return undefined;
    }

    const baseType = new PathTypeNode(path.token, path);

    if (!this.peekTokenIs(TokenType.LT)) {
      return baseType;
    }

    this.nextToken();
    this.nextToken();
    const typeParameters: TypeNode[] = [];
    const firstParam = this.parseTypeNode();
    if (!firstParam) return undefined;
    typeParameters.push(firstParam);

    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken();
      this.nextToken();
      const param = this.parseTypeNode();
      if (!param) return undefined;
      typeParameters.push(param);
    }

    if (!this.expectPeek(TokenType.GT)) {
      return undefined;
    }

    if (path.parts.length > 1) {
      this.errors.push('Generic type parameters on qualified types are not yet supported.');
      return undefined;
    }

    const genericTypeName = path.parts[0].value;
    return new GenericTypeNode(baseType.token, genericTypeName, typeParameters);
  }

  private parseFunctionTypeNode(): TypeNode | undefined {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.LPAREN)) return undefined;
    const parameters: TypeNode[] = [];
    if (!this.peekTokenIs(TokenType.RPAREN)) {
      this.nextToken();
      const firstParam = this.parseTypeNode();
      if (firstParam) parameters.push(firstParam);
      while (this.peekTokenIs(TokenType.COMMA)) {
        this.nextToken();
        this.nextToken();
        const nextParam = this.parseTypeNode();
        if (nextParam) parameters.push(nextParam);
      }
    }
    if (!this.expectPeek(TokenType.RPAREN)) return undefined;
    if (!this.expectPeek(TokenType.ARROW)) return undefined;
    this.nextToken();
    const returnType = this.parseTypeNode();
    if (!returnType) return undefined;
    return new FunctionTypeNode(token, parameters, returnType);
  }

  private parseTypeAnnotationExpression(left: Expression): Expression | undefined {
    if (!(left instanceof Identifier)) {
      this.errors.push('Type annotation can only be applied to an identifier.');
      return undefined;
    }

    this.nextToken();
    const typeNode = this.parseTypeNode();
    if (!typeNode) {
      return undefined;
    }

    left.typeAnnotation = typeNode;
    return left;
  }

  private curTokenIs(t: TokenType): boolean {
    return this.curToken.type === t;
  }

  private peekTokenIs(t: TokenType): boolean {
    return this.peekToken.type === t;
  }

  private expectPeek(t: TokenType): boolean {
    if (this.peekTokenIs(t)) {
      this.nextToken();
      return true;
    } else {
      this.peekError(t);
      return false;
    }
  }

  private peekError(t: TokenType): void {
    const errorMessage = `Syntax Error: Expected next token to be '${t}', but got '${this.peekToken.literal}' instead.`;
    this.errors.push(errorMessage);
  }

  private noPrefixParseFnError(): void {
    const errorMessage = `Syntax Error: Unexpected token '${this.curToken.literal}'. This token cannot start an expression.`;
    this.errors.push(errorMessage);
  }

  private peekPrecedence(): Precedence {
    return precedences[this.peekToken.type] || Precedence.LOWEST;
  }

  private curPrecedence(): Precedence {
    return precedences[this.curToken.type] || Precedence.LOWEST;
  }

  private registerPrefix(tokenType: TokenType, fn: prefixParseFn): void {
    this.prefixParseFns[tokenType] = fn;
  }

  private registerInfix(tokenType: TokenType, fn: infixParseFn): void {
    this.infixParseFns[tokenType] = fn;
  }
}
