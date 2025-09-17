import * as ast from '@syntax/ast.js';
import { Environment } from '@interpreter/evaluator/environment.js';
import type { ModuleLoader } from '../loader.js';

export enum ObjectType {
  INTEGER = 'Integer',
  DOUBLE = 'Double',
  BOOLEAN = 'Boolean',
  STRING = 'String',
  ARRAY = 'Array',
  HASH = 'Hash',
  RECORD = 'Record',
  NULL = 'NULL',
  RETURN_VALUE = 'RETURN_VALUE',
  FUNCTION = 'FUNCTION',
  ERROR = 'ERROR',
  BUILTIN = 'BUILTIN',
  TUPLE = 'TUPLE',
  SUM_TYPE_INSTANCE = 'SUM_TYPE_INSTANCE',
  MODULE = 'MODULE',
}

export interface LumenObject {
  type(): ObjectType;
  inspect(): string;
}

export interface Hashable {
  hashKey(): string;
}

export class LumenInteger implements LumenObject, Hashable {
  constructor(public value: number) {}
  public type(): ObjectType {
    return ObjectType.INTEGER;
  }
  public inspect(): string {
    return this.value.toString();
  }
  public hashKey(): string {
    return `INTEGER_${this.value}`;
  }
}

export class LumenDouble implements LumenObject, Hashable {
  constructor(public value: number) {}
  public type(): ObjectType {
    return ObjectType.DOUBLE;
  }
  public inspect(): string {
    return this.value.toString();
  }
  public hashKey(): string {
    return `DOUBLE_${this.value}`;
  }
}

export class LumenBoolean implements LumenObject {
  constructor(public value: boolean) {}

  public type(): ObjectType {
    return ObjectType.BOOLEAN;
  }

  public inspect(): string {
    return this.value.toString();
  }
}

export class LumenNull implements LumenObject {
  public type(): ObjectType {
    return ObjectType.NULL;
  }

  public inspect(): string {
    return 'null';
  }
}

export class LumenReturnValue implements LumenObject {
  constructor(public value: LumenObject) {}

  public type(): ObjectType {
    return ObjectType.RETURN_VALUE;
  }

  public inspect(): string {
    return this.value.inspect();
  }
}

export class LumenFunction implements LumenObject {
  public isRecordConstructor?: boolean;
  public recordName?: string;
  public selfContext?: LumenObject;

  constructor(
    public parameters: ast.Identifier[],
    public body: ast.Expression | ast.BlockStatement,
    public env: Environment,
  ) {}

  public type(): ObjectType {
    return ObjectType.FUNCTION;
  }

  public inspect(): string {
    if (this.isRecordConstructor) {
      return `<record constructor for ${this.recordName}>`;
    }
    const params = this.parameters.map((p) => p.toString()).join(', ');
    return `fn(${params}) { ... }`;
  }
}

export class LumenString implements LumenObject, Hashable {
  constructor(public value: string) {}
  public type(): ObjectType {
    return ObjectType.STRING;
  }
  public inspect(): string {
    return this.value;
  }
  public hashKey(): string {
    return `STRING_${this.value}`;
  }
}

export class LumenArray implements LumenObject {
  constructor(public elements: LumenObject[]) {}

  public type(): ObjectType {
    return ObjectType.ARRAY;
  }

  public inspect(): string {
    const elements = this.elements.map((e) => e.inspect()).join(', ');
    return `[${elements}]`;
  }
}

export class LumenError implements LumenObject {
  constructor(
    public message: string,
    public node?: ast.Node,
  ) {}

  public type(): ObjectType {
    return ObjectType.ERROR;
  }

  public inspect(): string {
    return `Error: ${this.message}`;
  }
}

export type BuiltinFunction = (loader: ModuleLoader, ...args: LumenObject[]) => LumenObject;

export class LumenBuiltin implements LumenObject {
  constructor(public fn: BuiltinFunction) {}

  public type(): ObjectType {
    return ObjectType.BUILTIN;
  }

  public inspect(): string {
    return 'builtin function';
  }
}

export interface HashPair {
  key: LumenObject;
  value: LumenObject;
}

export class LumenHash implements LumenObject {
  public pairs: Map<string, HashPair>;

  constructor(pairs: Map<string, HashPair>) {
    this.pairs = pairs;
  }

  public type(): ObjectType {
    return ObjectType.HASH;
  }

  public inspect(): string {
    const pairs = [...this.pairs.values()]
      .map((p) => `${p.key.inspect()}: ${p.value.inspect()}`)
      .join(', ');
    return `{${pairs}}`;
  }
}

export class LumenSumTypeInstance implements LumenObject {
  constructor(
    public typeName: string,
    public variantName: string,
    public values: LumenObject[],
  ) {}

  public type(): ObjectType {
    return ObjectType.SUM_TYPE_INSTANCE;
  }

  public inspect(): string {
    const values = this.values.map((v) => v.inspect()).join(', ');
    return `${this.variantName}(${values})`;
  }
}

export class LumenRecord implements LumenObject {
  constructor(
    public name: string,
    public fields: Map<string, LumenObject>,
  ) {}

  public type(): ObjectType {
    return ObjectType.RECORD;
  }
  public inspect(): string {
    const fields = [...this.fields.entries()]
      .map(([key, value]) => `${key}: ${value.inspect()}`)
      .join(', ');
    return `${this.name} { ${fields} }`;
  }
}

export class LumenModule implements LumenObject {
  constructor(
    public name: string,
    public env: Environment,
  ) {}
  public type(): ObjectType {
    return ObjectType.MODULE;
  }
  public inspect(): string {
    return `<module ${this.name}>`;
  }
}

export class LumenTuple implements LumenObject {
  constructor(public elements: LumenObject[]) {}

  public type(): ObjectType {
    return ObjectType.TUPLE;
  }

  public inspect(): string {
    const elements = this.elements.map((e) => e.inspect()).join(', ');
    return `(${elements})`;
  }
}

export const NULL = new LumenNull();
