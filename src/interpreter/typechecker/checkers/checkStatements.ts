import * as ast from '@syntax/ast.js';
import {
  type LumenType,
  TypeKind,
  ErrorType,
  FunctionType,
  TypeVariable,
  ArrayType,
  TupleType,
  ModuleType,
  TraitType,
  NULL_TYPE,
} from '@syntax/type.js';
import { TypeEnvironment } from '../environment.js';
import { ModuleLoader } from '../../../loader.js';
import { check } from '../typechecker.js';
import { isSameType, typeNodeToLumenType, unify } from '../utils.js';

export function checkLetStatement(
  node: ast.LetStatement,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  if (node.name instanceof ast.TuplePattern) {
    const valueType = check(node.value, env, loader);
    if (valueType.kind() === TypeKind.ERROR) return valueType;

    if (valueType.kind() !== TypeKind.TUPLE) {
      return new ErrorType(
        `type mismatch: expected a tuple to destructure, but got ${valueType.toString()}`,
        node.value,
      );
    }

    const tupleType = valueType as TupleType;
    const pattern = node.name as ast.TuplePattern;

    if (pattern.elements.length !== tupleType.elementTypes.length) {
      return new ErrorType(
        `destructuring mismatch: pattern has ${pattern.elements.length} elements but tuple has ${tupleType.elementTypes.length}`,
        node.name,
      );
    }

    for (let i = 0; i < pattern.elements.length; i++) {
      const elem = pattern.elements[i];
      if (elem instanceof ast.Identifier) {
        const elemType = tupleType.elementTypes[i];
        env.set(elem.value, elemType, node.isMutable);
      } else {
        return new ErrorType('destructuring nested patterns is not yet supported', elem);
      }
    }
    return valueType;
  } else if (node.name instanceof ast.ArrayPattern) {
    const valueType = check(node.value, env, loader);
    if (valueType.kind() === TypeKind.ERROR) return valueType;

    if (valueType.kind() !== TypeKind.ARRAY) {
      return new ErrorType(
        `type mismatch: expected an array to destructure, but got ${valueType.toString()}`,
        node.value,
      );
    }
    const arrayType = valueType as ArrayType;
    const elementType = arrayType.elementType;
    const pattern = node.name as ast.ArrayPattern;

    for (const elem of pattern.elements) {
      env.set(elem.value, elementType, node.isMutable);
    }
    if (pattern.rest) {
      env.set(pattern.rest.value, arrayType, node.isMutable);
    }
    return valueType;
  } else if (node.name instanceof ast.Identifier) {
    const name = node.name.value;
    if (env.get(name) && !(node.value instanceof ast.FunctionLiteral)) {
      return new ErrorType(`identifier '${name}' already declared`, node.name);
    }

    if (node.value instanceof ast.FunctionLiteral) {
      const funcNode = node.value;

      const hasAllAnnotations =
        funcNode.returnType && funcNode.parameters.every((p) => p.typeAnnotation);

      if (hasAllAnnotations) {
        const tempEnv = new TypeEnvironment(env);
        const typeParameters: TypeVariable[] = [];

        if (funcNode.typeParameters) {
          for (const tpNode of funcNode.typeParameters) {
            const typeVar = new TypeVariable(tpNode.name.value);
            typeParameters.push(typeVar);
            tempEnv.set(tpNode.name.value, typeVar, false);
          }

          for (let i = 0; i < funcNode.typeParameters.length; i++) {
            const tpNode = funcNode.typeParameters[i];
            const typeVar = typeParameters[i];
            const bounds: TraitType[] = [];
            for (const boundNode of tpNode.bounds) {
              const boundType = typeNodeToLumenType(boundNode, tempEnv);
              if (boundType.kind() === TypeKind.ERROR) return boundType;
              if (boundType.kind() !== TypeKind.TRAIT) {
                return new ErrorType(`expected a trait, got ${boundType.toString()}`, boundNode);
              }
              bounds.push(boundType as TraitType);
            }
            typeVar.bounds = bounds;
          }
        }

        const params: LumenType[] = [];
        for (const p of funcNode.parameters) {
          const paramType = typeNodeToLumenType(p.typeAnnotation!, tempEnv);
          if (paramType.kind() === TypeKind.ERROR) return paramType;
          params.push(paramType);
        }

        const declaredReturnType = typeNodeToLumenType(funcNode.returnType!, tempEnv);
        if (declaredReturnType.kind() === TypeKind.ERROR) return declaredReturnType;

        const funcType = new FunctionType(params, declaredReturnType, typeParameters);

        env.set(name, funcType, node.isMutable);

        const functionBodyEnv = new TypeEnvironment(env);
        typeParameters.forEach((tp) => functionBodyEnv.set(tp.name, tp, false));
        functionBodyEnv.currentFunctionReturnType = declaredReturnType;
        params.forEach((paramType, i) =>
          functionBodyEnv.set(funcNode.parameters[i].value, paramType, false),
        );

        const bodyType = check(funcNode.body, functionBodyEnv, loader, declaredReturnType);
        if (bodyType.kind() === TypeKind.ERROR) return bodyType;

        if (!unify(declaredReturnType, bodyType, new Map())) {
          return new ErrorType(
            `type mismatch: function body returns ${bodyType.toString()} but is declared to return ${declaredReturnType.toString()}`,
            funcNode.body,
          );
        }

        return funcType;
      }
    }

    let declaredType: LumenType | undefined = undefined;
    if (node.typeAnnotation) {
      declaredType = typeNodeToLumenType(node.typeAnnotation, env);
      if (declaredType.kind() === TypeKind.ERROR) return declaredType;
    }
    const valueType = check(node.value, env, loader, declaredType);
    if (valueType.kind() === TypeKind.ERROR) return valueType;

    if (declaredType && !isSameType(declaredType, valueType)) {
      return new ErrorType(
        `type mismatch: declared type is ${declaredType.toString()} but value is of type ${valueType.toString()}`,
        node.value,
      );
    }
    env.set(name, valueType, node.isMutable);
    return valueType;
  }
  return new ErrorType('unsupported pattern in let statement', node.name);
}

export function checkModuleStatement(node: ast.ModuleStatement, env: TypeEnvironment): LumenType {
  const exposed = new Set(node.exposing.map((ident) => ident.value));
  env.exposedNames = exposed;
  return NULL_TYPE;
}

export function checkUseStatement(
  node: ast.UseStatement,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  const moduleName = node.path.toString();
  const loaded = loader.load(moduleName);

  if (loaded instanceof Error) {
    return new ErrorType(loaded.message, node);
  }

  env.mergeImplementations(loaded.typeEnv);

  if (node.alias) {
    const moduleType = new ModuleType(moduleName, loaded.typeEnv);
    env.set(node.alias.value, moduleType, false);
  } else if (!node.exposing) {
    const moduleType = new ModuleType(moduleName, loaded.typeEnv);
    const bindName = node.path.parts[node.path.parts.length - 1].value;
    env.set(bindName, moduleType, false);
  }

  if (node.exposing) {
    for (const exposed of node.exposing) {
      const name = exposed.value;

      if (loaded.typeEnv.exposedNames && !loaded.typeEnv.exposedNames.has(name)) {
        return new ErrorType(
          `identifier '${name}' is not exposed by module '${moduleName}'`,
          exposed,
        );
      }

      const binding = loaded.typeEnv.get(name);
      const constructor = loaded.typeEnv.constructors.get(name);

      if (!binding && !constructor) {
        return new ErrorType(`identifier '${name}' not found in module '${moduleName}'`, exposed);
      }

      if (binding) {
        env.set(name, binding.type, false);
      }

      if (constructor) {
        env.constructors.set(name, constructor);
        if (!binding) {
          env.set(name, constructor, false);
        }
      }
    }
  }

  return NULL_TYPE;
}
