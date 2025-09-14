import { TypeEnvironment } from '@interpreter/typechecker/environment.js';
import type { Node } from '@syntax/ast.js';

export enum TypeKind {
  INTEGER = 'INTEGER',
  DOUBLE = 'DOUBLE',
  BOOLEAN = 'BOOLEAN',
  STRING = 'STRING',
  FUNCTION = 'FUNCTION',
  HASH = 'HASH',
  ARRAY = 'ARRAY',
  ANY = 'ANY',
  ERROR = 'ERROR',
  NULL = 'NULL',
  SUM_TYPE = 'SUM_TYPE',
  VARIANT_TYPE = 'VARIANT_TYPE',
  TYPE_VARIABLE = 'TYPE_VARIABLE',
  RECORD = 'RECORD',
  TRAIT = 'TRAIT',
  MODULE = 'MODULE',
}

export interface LumenType {
  kind(): TypeKind;
  toString(): string;
}

export class IntegerType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.INTEGER;
  }
  public toString(): string {
    return 'Integer';
  }
}

export class DoubleType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.DOUBLE;
  }
  public toString(): string {
    return 'Double';
  }
}

export class BooleanType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.BOOLEAN;
  }
  public toString(): string {
    return 'Boolean';
  }
}

export class StringType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.STRING;
  }
  public toString(): string {
    return 'String';
  }
}

export class RecordType implements LumenType {
  constructor(
    public name: string,
    public fields: Map<string, LumenType>,
    public fieldOrder: string[],
    public typeParameters: TypeVariable[] = [],
    public typeArguments: LumenType[] = [],
  ) {}

  public kind(): TypeKind {
    return TypeKind.RECORD;
  }

  public toString(): string {
    if (this.typeArguments.length > 0) {
      const params = this.typeArguments.map((t) => t.toString()).join(', ');
      return `${this.name}<${params}>`;
    }
    if (this.typeParameters.length > 0) {
      const params = this.typeParameters.map((p) => p.name).join(', ');
      return `${this.name}<${params}>`;
    }
    return this.name;
  }
}

export class ErrorType implements LumenType {
  constructor(
    public message: string,
    public node?: Node,
  ) {}
  public kind(): TypeKind {
    return TypeKind.ERROR;
  }
  public toString(): string {
    return `TypeError: ${this.message}`;
  }
}

export class TypeVariable implements LumenType {
  constructor(
    public name: string,
    public bounds: TraitType[] = [],
  ) {}
  public kind(): TypeKind {
    return TypeKind.TYPE_VARIABLE;
  }
  public toString(): string {
    if (this.bounds.length > 0) {
      const bounds = this.bounds.map((b) => b.toString()).join(' + ');
      return `${this.name}: ${bounds}`;
    }
    return this.name;
  }
}

export class FunctionType implements LumenType {
  constructor(
    public parameters: LumenType[],
    public returnType: LumenType,
    public typeParameters: TypeVariable[] = [],
  ) {}

  public kind(): TypeKind {
    return TypeKind.FUNCTION;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    let out = 'fn';
    if (this.typeParameters.length > 0) {
      const typeParams = this.typeParameters.map((p) => p.toString()).join(', ');
      out += `<${typeParams}>`;
    }
    out += `(${params}) -> ${this.returnType.toString()}`;
    return out;
  }
}

export class ArrayType implements LumenType {
  constructor(public elementType: LumenType) {}

  public kind(): TypeKind {
    return TypeKind.ARRAY;
  }
  public toString(): string {
    return `Array<${this.elementType.toString()}>`;
  }
}

export class HashType implements LumenType {
  constructor(
    public keyType: LumenType,
    public valueType: LumenType,
  ) {}

  public kind(): TypeKind {
    return TypeKind.HASH;
  }
  public toString(): string {
    return `Hash<${this.keyType.toString()}, ${this.valueType.toString()}>`;
  }
}

export class AnyType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.ANY;
  }
  public toString(): string {
    return 'Any';
  }
}

export class NullType implements LumenType {
  public kind(): TypeKind {
    return TypeKind.NULL;
  }
  public toString(): string {
    return 'Null';
  }
}

export class VariantType implements LumenType {
  constructor(
    public name: string,
    public parameters: LumenType[],
    public parent: SumType,
  ) {}
  public kind(): TypeKind {
    return TypeKind.VARIANT_TYPE;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `${this.name}(${params})`;
  }
}

export class SumType implements LumenType {
  public variants: Map<string, VariantType> = new Map();
  constructor(
    public name: string,
    public typeParameters: TypeVariable[] = [],
    public typeArguments: LumenType[] = [],
  ) {}

  public kind(): TypeKind {
    return TypeKind.SUM_TYPE;
  }

  public toString(): string {
    if (this.typeArguments.length > 0) {
      const params = this.typeArguments.map((t) => t.toString()).join(', ');
      return `${this.name}<${params}>`;
    }
    if (this.typeParameters.length > 0) {
      const params = this.typeParameters.map((p) => p.name).join(', ');
      return `${this.name}<${params}>`;
    }
    return this.name;
  }
}

export class TraitMethodType implements LumenType {
  constructor(
    public name: string,
    public parameters: LumenType[],
    public returnType: LumenType,
  ) {}

  public kind(): TypeKind {
    return TypeKind.FUNCTION;
  }
  public toString(): string {
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `fn ${this.name}(${params}) -> ${this.returnType.toString()}`;
  }
}

export class TraitType implements LumenType {
  public methods: Map<string, TraitMethodType> = new Map();
  constructor(
    public name: string,
    public typeParameters: TypeVariable[] = [],
    public typeArguments: LumenType[] = [],
  ) {}

  public kind(): TypeKind {
    return TypeKind.TRAIT;
  }
  public toString(): string {
    let out = this.name;
    if (this.typeArguments.length > 0) {
      const params = this.typeArguments.map((t) => t.toString()).join(', ');
      out += `<${params}>`;
    } else if (this.typeParameters.length > 0) {
      const params = this.typeParameters.map((p) => p.name).join(', ');
      out += `<${params}>`;
    }
    return out;
  }
}

export class ModuleType implements LumenType {
  constructor(
    public name: string,
    public env: TypeEnvironment,
  ) {}
  public kind(): TypeKind {
    return TypeKind.MODULE;
  }
  public toString(): string {
    return `<module ${this.name}>`;
  }
}

export const INTEGER_TYPE = new IntegerType();
export const DOUBLE_TYPE = new DoubleType();
export const BOOLEAN_TYPE = new BooleanType();
export const STRING_TYPE = new StringType();
export const ANY_TYPE = new AnyType();
export const NULL_TYPE = new NullType();
