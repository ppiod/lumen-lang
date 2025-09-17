import * as ast from '@syntax/ast.js';
import { substitute, typeNodeToLumenType, unify } from './utils.js';
import type { FunctionType, LumenType, RecordType, SumType, TraitType } from '@syntax/type.js';
import { TypeKind, TypeVariable } from '@syntax/type.js';

export interface ImplementationBinding {
  impl: ast.ImplementationStatement;
  env: TypeEnvironment;
}

interface TypeBinding {
  type: LumenType;
  isMutable: boolean;
}

export class TypeEnvironment {
  private store: Map<string, TypeBinding>;
  public constructors: Map<string, FunctionType>;
  public implementations: Map<string, ImplementationBinding[]>;
  private outer: TypeEnvironment | null;
  public exposedNames: Set<string> | undefined = undefined;
  public currentFunctionReturnType?: LumenType;

  constructor(outer: TypeEnvironment | null = null) {
    this.store = new Map();
    this.constructors = outer ? outer.constructors : new Map();
    this.implementations = outer ? outer.implementations : new Map();
    this.outer = outer;
    this.currentFunctionReturnType = outer ? outer.currentFunctionReturnType : undefined;
  }

  public mergeImplementations(otherEnv: TypeEnvironment): void {
    for (const [typeName, implsToAdd] of otherEnv.implementations.entries()) {
      if (!this.implementations.has(typeName)) {
        this.implementations.set(typeName, []);
      }
      const existingImpls = this.implementations.get(typeName)!;
      for (const implToAdd of implsToAdd) {
        if (!existingImpls.some((e) => e.impl === implToAdd.impl)) {
          existingImpls.push(implToAdd);
        }
      }
    }
  }

  public get(name: string): TypeBinding | undefined {
    let binding = this.store.get(name);
    if (!binding && this.outer) {
      binding = this.outer.get(name);
    }
    return binding;
  }

  public set(name: string, type: LumenType, isMutable: boolean): LumenType {
    this.store.set(name, { type, isMutable });
    return type;
  }

  public addImplementation(
    baseTypeName: string,
    implStatement: ast.ImplementationStatement,
    implEnv: TypeEnvironment,
  ): void {
    if (!this.implementations.has(baseTypeName)) this.implementations.set(baseTypeName, []);

    this.implementations.get(baseTypeName)!.push({ impl: implStatement, env: implEnv });
  }

  public hasImplementation(
    targetType: LumenType,
    requiredTrait: TraitType,
    substitutions: Map<string, LumenType>,
  ): boolean {
    let baseTypeName: string;
    if (targetType.kind() === TypeKind.RECORD) {
      baseTypeName = (targetType as RecordType).name;
    } else if (targetType.kind() === TypeKind.SUM_TYPE) {
      baseTypeName = (targetType as SumType).name;
    } else if (targetType.kind() === TypeKind.HASH) {
      baseTypeName = 'Hash';
    } else {
      baseTypeName = targetType.toString();
    }

    const potentialImpls = this.getImplementationsForType(baseTypeName);

    for (const binding of potentialImpls) {
      const { impl, env: implEnv } = binding;
      const attemptSubstitutions = new Map(substitutions);

      const implTraitType = typeNodeToLumenType(impl.trait, implEnv);
      if (
        implTraitType.kind() !== TypeKind.TRAIT ||
        !unify(requiredTrait, implTraitType, attemptSubstitutions)
      ) {
        continue;
      }

      const implTargetType = typeNodeToLumenType(impl.targetType, implEnv);
      if (!unify(targetType, implTargetType, attemptSubstitutions)) {
        continue;
      }

      let boundsAreSatisfied = true;
      if (impl.typeParameters) {
        for (const typeParam of impl.typeParameters) {
          const concreteType = substitute(
            new TypeVariable(typeParam.name.value),
            attemptSubstitutions,
          );
          if (concreteType.kind() === TypeKind.TYPE_VARIABLE) {
            continue;
          }
          for (const bound of typeParam.bounds) {
            const boundType = typeNodeToLumenType(bound, implEnv) as TraitType;
            if (!this.hasImplementation(concreteType, boundType, attemptSubstitutions)) {
              boundsAreSatisfied = false;
              break;
            }
          }
          if (!boundsAreSatisfied) break;
        }
      }

      if (boundsAreSatisfied) {
        attemptSubstitutions.forEach((value, key) => substitutions.set(key, value));
        return true;
      }
    }

    return false;
  }

  public getImplementationsForType(baseTypeName: string): ImplementationBinding[] {
    return this.implementations.get(baseTypeName) || [];
  }
}
