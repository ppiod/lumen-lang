import { TokenType, type Token } from './token.js';
export type { Token };

export interface Node {
  token: Token;
  tokenLiteral(): string;
  toString(): string;
}

export interface Statement extends Node {
  statementNode(): void;
}

export interface Expression extends Node {
  expressionNode(): void;
}

export type TypeNode = Node;

export class TuplePattern implements Pattern {
  constructor(
    public token: Token,
    public elements: Pattern[],
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const elements = this.elements.map((p) => p.toString()).join(', ');
    return `(${elements})`;
  }
}

export class GenericTypeNode implements TypeNode {
  constructor(
    public token: Token,
    public value: string,
    public typeParameters: TypeNode[],
  ) {}
  public baseName(): string {
    return this.value;
  }

  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.typeParameters.map((p) => p.toString()).join(', ');
    return `${this.value}<${params}>`;
  }
}

export class FunctionTypeNode implements TypeNode {
  constructor(
    public token: Token,
    public parameters: TypeNode[],
    public returnType: TypeNode,
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `fn(${params}) -> ${this.returnType.toString()}`;
  }
}

export class Program implements Node {
  public statements: Statement[] = [];
  public token: Token;

  constructor() {
    this.token = { type: TokenType.ILLEGAL, literal: '', line: 0, column: 0 };
  }

  public tokenLiteral(): string {
    if (this.statements.length > 0) {
      return this.statements[0].tokenLiteral();
    } else {
      return '';
    }
  }

  public toString(): string {
    return this.statements.map((s) => s.toString()).join('');
  }
}

export class LetStatement implements Statement {
  constructor(
    public token: Token,
    public name: Pattern,
    public value: Expression,
    public isMutable: boolean,
    public typeAnnotation?: TypeNode,
  ) {}

  public statementNode() {}

  public tokenLiteral(): string {
    return this.token.literal;
  }

  public toString(): string {
    let out = this.tokenLiteral() + ' ';
    if (this.isMutable) {
      out += 'mut ';
    }
    out += this.name.toString();

    if (this.typeAnnotation) {
      out += `: ${this.typeAnnotation.toString()}`;
    }

    out += ' = ';

    if (this.value) {
      out += this.value.toString();
    }

    out += ';';
    return out;
  }
}

export class Identifier implements Expression {
  constructor(
    public token: Token,
    public value: string,
    public typeAnnotation?: TypeNode,
  ) {}

  public expressionNode() {}

  public tokenLiteral(): string {
    return this.token.literal;
  }

  public toString(): string {
    let out = this.value;
    if (this.typeAnnotation) {
      out += `: ${this.typeAnnotation.toString()}`;
    }
    return out;
  }
}

export class ReturnStatement implements Statement {
  constructor(
    public token: Token,
    public returnValue: Expression,
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    let out = `${this.tokenLiteral()} `;
    if (this.returnValue) {
      out += this.returnValue.toString();
    }
    out += ';';
    return out;
  }
}

export class ExpressionStatement implements Statement {
  constructor(
    public token: Token,
    public expression: Expression,
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    if (this.expression) {
      return this.expression.toString();
    }
    return '';
  }
}

export class IntegerLiteral implements Expression {
  constructor(
    public token: Token,
    public value: number,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.token.literal;
  }
}

export class DoubleLiteral implements Expression {
  constructor(
    public token: Token,
    public value: number,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.token.literal;
  }
}

export class PrefixExpression implements Expression {
  constructor(
    public token: Token,
    public operator: string,
    public right: Expression,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `(${this.operator}${this.right.toString()})`;
  }
}

export class InfixExpression implements Expression {
  constructor(
    public token: Token,
    public left: Expression,
    public operator: string,
    public right: Expression,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `(${this.left.toString()} ${this.operator} ${this.right.toString()})`;
  }
}

export class BooleanLiteral implements Expression {
  constructor(
    public token: Token,
    public value: boolean,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.token.literal;
  }
}

export class BlockStatement implements Statement, Expression {
  public statements: Statement[] = [];
  constructor(public token: Token) {}
  public statementNode() {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.statements.map((s) => s.toString()).join('');
  }
}

export class IfExpression implements Expression {
  constructor(
    public token: Token,
    public condition: Expression,
    public consequence: Expression | BlockStatement,
    public alternative?: Expression | BlockStatement,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    let out = `if ${this.condition.toString()}: ${this.consequence.toString()}`;
    if (this.alternative) {
      out += ` else: ${this.alternative.toString()}`;
    }
    return out;
  }
}

export class TypeParameterNode implements Node {
  constructor(
    public token: Token,
    public name: Identifier,
    public bounds: TypeNode[],
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    if (this.bounds.length > 0) {
      const bounds = this.bounds.map((b) => b.toString()).join(' + ');
      return `${this.name.toString()}: ${bounds}`;
    }
    return this.name.toString();
  }
}

export class FunctionLiteral implements Expression {
  constructor(
    public token: Token,
    public name: Identifier | null,
    public parameters: Identifier[],
    public body: Expression | BlockStatement,
    public returnType?: TypeNode,
    public typeParameters?: TypeParameterNode[],
  ) {}

  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    let out = this.tokenLiteral();

    if (this.typeParameters && this.typeParameters.length > 0) {
      const typeParams = this.typeParameters.map((p) => p.toString()).join(', ');
      out += `<${typeParams}>`;
    }

    out += `(${params})`;

    if (this.returnType) {
      out += ` -> ${this.returnType.toString()}`;
    }
    if (this.body instanceof BlockStatement) {
      out += ` { ${this.body.toString()} }`;
    } else {
      out += `: ${this.body.toString()}`;
    }
    return out;
  }
}

export class CallExpression implements Expression {
  constructor(
    public token: Token,
    public func: Expression,
    public args: Expression[],
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const args = this.args.map((a) => a.toString()).join(', ');
    return `${this.func.toString()}(${args})`;
  }
}

export class StringLiteral implements Expression {
  constructor(
    public token: Token,
    public value: string,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.token.literal;
  }
}

export class ArrayLiteral implements Expression {
  constructor(
    public token: Token,
    public elements: Expression[],
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const elements = this.elements.map((e) => e.toString()).join(', ');
    return `[${elements}]`;
  }
}

export class IndexExpression implements Expression {
  constructor(
    public token: Token,
    public left: Expression,
    public index: Expression,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `(${this.left.toString()}[${this.index.toString()}])`;
  }
}

export class HashLiteral implements Expression {
  public pairs: Map<Expression, Expression>;
  constructor(public token: Token) {
    this.pairs = new Map();
  }
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const pairs = [...this.pairs.entries()]
      .map(([key, value]) => `${key.toString()}:${value.toString()}`)
      .join(', ');
    return `{${pairs}}`;
  }
}

export class TypeVariantNode implements Node {
  constructor(
    public token: Token,
    public name: Identifier,
    public parameters: TypeNode[],
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `${this.name.toString()}(${params})`;
  }
}

export class TypeDeclarationStatement implements Statement {
  constructor(
    public token: Token,
    public name: Identifier,
    public typeParameters: Identifier[],
    public variants: TypeVariantNode[],
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.typeParameters.map((p) => p.toString()).join(', ');
    const variants = this.variants.map((v) => v.toString()).join(' | ');
    let out = `type ${this.name.toString()}`;
    if (this.typeParameters.length > 0) {
      out += `<${params}>`;
    }
    out += ` = ${variants}`;
    return out;
  }
}

export type Pattern = Node;

export class VariantPattern implements Pattern {
  constructor(
    public token: Token,
    public path: Identifier,
    public parameters: Identifier[],
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `${this.path.toString()}(${params})`;
  }
}

export class MatchArm implements Node {
  constructor(
    public token: Token,
    public pattern: Pattern,
    public body: Expression | BlockStatement,
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `${this.pattern.toString()} => ${this.body.toString()}`;
  }
}

export class MatchExpression implements Expression {
  constructor(
    public token: Token,
    public values: Expression[],
  ) {}
  public arms: MatchArm[] = [];
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const values = this.values.map((v) => v.toString()).join(', ');
    const arms = this.arms.map((a) => a.toString()).join(', ');
    return `match (${values}) { ${arms} }`;
  }
}

export interface RecordField extends Node {
  name: Identifier;
  type: TypeNode;
}

export class RecordDeclarationStatement implements Statement {
  constructor(
    public token: Token,
    public name: Identifier,
    public fields: RecordField[],
    public typeParameters: Identifier[],
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }

  public toString(): string {
    let out = `record ${this.name.toString()}`;

    if (this.typeParameters.length > 0) {
      const params = this.typeParameters.map((p) => p.toString()).join(', ');
      out += `<${params}>`;
    }

    const fields = this.fields.map((f) => `${f.name.toString()}: ${f.type.toString()}`).join(', ');

    out += `(${fields})`;

    return out;
  }
}

export class MemberAccessExpression implements Expression {
  constructor(
    public token: Token,
    public object: Expression,
    public property: Identifier,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `(${this.object.toString()}.${this.property.toString()})`;
  }
}

export class TraitMethodSignature implements Node {
  constructor(
    public token: Token,
    public name: Identifier,
    public parameters: Identifier[],
    public returnType: TypeNode,
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `fn ${this.name.toString()}(${params}) -> ${this.returnType.toString()}`;
  }
}

export class TraitDeclarationStatement implements Statement {
  constructor(
    public token: Token,
    public name: Identifier,
    public methods: TraitMethodSignature[],
    public typeParameters: Identifier[],
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const methods = this.methods.map((m) => m.toString()).join('; ');
    return `trait ${this.name.toString()} { ${methods} }`;
  }
}

export class ImplementationStatement implements Statement {
  constructor(
    public token: Token,
    public trait: TypeNode,
    public targetType: TypeNode,
    public methods: FunctionLiteral[],
    public typeParameters?: TypeParameterNode[],
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const methods = this.methods.map((m) => m.toString()).join(' ');
    return `impl ${this.trait.toString()} for ${this.targetType.toString()} { ${methods} }`;
  }
}

export class WildcardPattern implements Pattern {
  constructor(public token: Token) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return '_';
  }
}

export class ArrayPattern implements Pattern {
  constructor(
    public token: Token,
    public elements: Identifier[],
    public rest?: Identifier,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const elements = this.elements.map((e) => e.toString()).join(', ');
    if (this.rest) {
      return `[${elements}, ...${this.rest.toString()}]`;
    }
    return `[${elements}]`;
  }
}

export class ModuleStatement implements Statement {
  constructor(
    public token: Token,
    public name: PathIdentifier,
    public exposing: Identifier[],
  ) {}

  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    let out = `${this.tokenLiteral()} ${this.name.toString()}`;
    if (this.exposing.length > 0) {
      const exposed = this.exposing.map((e) => e.toString()).join(', ');
      out += ` exposing (${exposed})`;
    }
    out += ';';
    return out;
  }
}

export class PathIdentifier implements Node {
  constructor(
    public token: Token,
    public parts: Identifier[],
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.parts.map((p) => p.toString()).join('.');
  }
}

export class UseStatement implements Statement {
  constructor(
    public token: Token,
    public path: PathIdentifier,
    public alias: Identifier | null,
    public exposing: Identifier[] | null,
  ) {}
  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    let out = `use ${this.path.toString()}`;
    if (this.alias) {
      out += ` as ${this.alias.toString()}`;
    }
    if (this.exposing) {
      const exposed = this.exposing.map((e) => e.toString()).join(', ');
      out += ` exposing (${exposed})`;
    }
    out += ';';
    return out;
  }
}

export class PathTypeNode implements TypeNode {
  constructor(
    public token: Token,
    public path: PathIdentifier,
  ) {}
  public baseName(): string {
    return this.path.parts[this.path.parts.length - 1].value;
  }
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return this.path.toString();
  }
}

export class TryExpression implements Expression {
  constructor(
    public token: Token,
    public left: Expression,
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    return `(${this.left.toString()}?)`;
  }
}

export class WhenExpressionBranch {
  constructor(
    public patterns: Expression[],
    public body: Expression,
  ) {}
}

export class WhenExpression implements Expression {
  readonly _tag = 'WhenExpression';

  constructor(
    public token: Token,
    public subject: Expression | null,
    public branches: WhenExpressionBranch[],
    public elseBody: Expression,
  ) {}

  expressionNode(): void {}
  tokenLiteral(): string {
    return this.token.literal;
  }
}

export class TupleLiteral implements Expression {
  constructor(
    public token: Token,
    public elements: Expression[],
  ) {}
  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const elements = this.elements.map((e) => e.toString()).join(', ');
    return `(${elements})`;
  }
}

export class TupleTypeNode implements TypeNode {
  constructor(
    public token: Token,
    public elementTypes: TypeNode[],
  ) {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const types = this.elementTypes.map((t) => t.toString()).join(', ');
    return `(${types})`;
  }
}

export class InterpolatedStringLiteral implements Expression {
  constructor(
    public token: Token,
    public parts: (StringLiteral | Expression)[], 
  ) {}

  public expressionNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const partsStr = this.parts.map(p => {
        if (p instanceof StringLiteral) {
            return p.value;
        }
        return `\${${p.toString()}}`;
    }).join('');
    return `$"${partsStr}"`;
  }
}

export class ActivePatternDeclarationStatement implements Statement {
  constructor(
    public token: Token,
    public cases: Identifier[],
    public patternFunction: FunctionLiteral,
  ) {}

  public statementNode() {}
  public tokenLiteral(): string {
    return this.token.literal;
  }
  public toString(): string {
    const cases = this.cases.map((c) => c.toString()).join(' | ');
    return `let (|${cases}|) = ${this.patternFunction.toString()};`;
  }
}