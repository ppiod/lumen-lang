import * as ast from '@syntax/ast.js';
import {
  type LumenType,
  TypeKind,
  ErrorType,
  INTEGER_TYPE,
  DOUBLE_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  FunctionType,
  ArrayType,
  HashType,
  NULL_TYPE,
  SumType,
  VariantType,
  TypeVariable,
  RecordType,
  TraitType,
  TraitMethodType,
  ModuleType,
} from '@syntax/type.js';
import { TypeEnvironment } from './environment.js';
import { ModuleLoader } from '../../loader.js';
import { getTraitNameFromTypeNode, substitute, typeNodeToLumenType, unify } from './utils.js';

export { typeNodeToLumenType, unify };

function isSameType(a: LumenType, b: LumenType): boolean {
  if (a.kind() === TypeKind.ANY || b.kind() === TypeKind.ANY) return true;

  if (
    (a.kind() === TypeKind.DOUBLE && b.kind() === TypeKind.INTEGER) ||
    (a.kind() === TypeKind.INTEGER && b.kind() === TypeKind.DOUBLE)
  ) {
    return true;
  }

  if (a.kind() !== b.kind()) return false;
  if (a.toString() === b.toString()) return true;

  if (a.kind() === TypeKind.ARRAY && b.kind() === TypeKind.ARRAY) {
    return isSameType((a as ArrayType).elementType, (b as ArrayType).elementType);
  }
  if (a.kind() === TypeKind.HASH && b.kind() === TypeKind.HASH) {
    const hashA = a as HashType;
    const hashB = b as HashType;
    return isSameType(hashA.keyType, hashB.keyType) && isSameType(hashA.valueType, hashB.valueType);
  }
  if (a.kind() === TypeKind.FUNCTION && b.kind() === TypeKind.FUNCTION) {
    const funcA = a as FunctionType;
    const funcB = b as FunctionType;
    if (funcA.parameters.length !== funcB.parameters.length) return false;
    if (!isSameType(funcA.returnType, funcB.returnType)) return false;
    for (let i = 0; i < funcA.parameters.length; i++) {
      if (!isSameType(funcA.parameters[i], funcB.parameters[i])) return false;
    }
    return true;
  }
  return false;
}

function checkRecordDeclaration(
  node: ast.RecordDeclarationStatement,
  env: TypeEnvironment,
): LumenType {
  const name = node.name.value;
  if (env.get(name)) {
    return new ErrorType(`Type ${name} is already defined.`, node);
  }

  const recordEnv = new TypeEnvironment(env);
  const typeParameters: TypeVariable[] = [];

  for (const tp of node.typeParameters) {
    const typeVar = new TypeVariable(tp.value);
    typeParameters.push(typeVar);
    recordEnv.set(tp.value, typeVar, false);
  }

  const fields = new Map<string, LumenType>();
  const fieldOrder: string[] = [];
  const constructorParams: LumenType[] = [];

  for (const field of node.fields) {
    const fieldName = field.name.value;
    const fieldType = typeNodeToLumenType(field.type, recordEnv);
    if (fieldType.kind() === TypeKind.ERROR) {
      return fieldType;
    }
    fields.set(fieldName, fieldType);
    fieldOrder.push(fieldName);
    constructorParams.push(fieldType);
  }

  const recordType = new RecordType(name, fields, fieldOrder, typeParameters);
  env.set(name, recordType, false);

  const constructorType = new FunctionType(constructorParams, recordType, typeParameters);
  env.constructors.set(name, constructorType);

  return NULL_TYPE;
}

function checkTraitDeclaration(
  node: ast.TraitDeclarationStatement,
  env: TypeEnvironment,
): LumenType {
  const name = node.name.value;
  if (env.get(name)) {
    return new ErrorType(`Type ${name} is already defined.`, node);
  }

  const traitEnv = new TypeEnvironment(env);
  const typeParameters: TypeVariable[] = [];
  for (const tp of node.typeParameters) {
    const typeVar = new TypeVariable(tp.value);
    typeParameters.push(typeVar);
    traitEnv.set(tp.value, typeVar, false);
  }

  const traitType = new TraitType(name, typeParameters);
  env.set(name, traitType, false);

  for (const methodNode of node.methods) {
    const methodName = methodNode.name.value;
    if (traitType.methods.has(methodName)) {
      return new ErrorType(
        `Method ${methodName} is already defined for trait ${name}.`,
        methodNode,
      );
    }

    const paramTypes: LumenType[] = [];
    for (let i = 0; i < methodNode.parameters.length; i++) {
      const param = methodNode.parameters[i];

      if (i === 0 && param.value === 'self' && !param.typeAnnotation) {
        paramTypes.push(new TypeVariable('self'));
        continue;
      }

      if (!param.typeAnnotation)
        return new ErrorType(`parameter ${param.value} needs a type annotation`, param);
      const paramType = typeNodeToLumenType(param.typeAnnotation, traitEnv);
      if (paramType.kind() === TypeKind.ERROR) return paramType;
      paramTypes.push(paramType);
    }

    const returnType = typeNodeToLumenType(methodNode.returnType, traitEnv);
    if (returnType.kind() === TypeKind.ERROR) return returnType;

    const methodType = new TraitMethodType(methodName, paramTypes, returnType);
    traitType.methods.set(methodName, methodType);
  }

  return NULL_TYPE;
}

function checkImplementationStatement(
  node: ast.ImplementationStatement,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  const implEnv = new TypeEnvironment(env);

  if (node.typeParameters) {
    for (const tpNode of node.typeParameters) {
      const bounds: TraitType[] = [];
      for (const boundNode of tpNode.bounds) {
        const boundType = typeNodeToLumenType(boundNode, env);
        if (boundType.kind() === TypeKind.ERROR) return boundType;
        if (boundType.kind() !== TypeKind.TRAIT) {
          return new ErrorType(`expected a trait, got ${boundType.toString()}`, boundNode);
        }
        bounds.push(boundType as TraitType);
      }
      const typeVar = new TypeVariable(tpNode.name.value, bounds);
      implEnv.set(tpNode.name.value, typeVar, false);
    }
  }

  const traitType = typeNodeToLumenType(node.trait, implEnv);
  if (traitType.kind() === TypeKind.ERROR) return traitType;
  if (traitType.kind() !== TypeKind.TRAIT) {
    return new ErrorType(`expected a trait, got ${traitType.toString()}`, node.trait);
  }
  const trait = traitType as TraitType;

  const targetType = typeNodeToLumenType(node.targetType, implEnv);
  if (targetType.kind() === TypeKind.ERROR) return targetType;

  let baseTypeName = targetType.toString();
  if (targetType.kind() === TypeKind.RECORD) {
    baseTypeName = (targetType as RecordType).name;
  } else if (targetType.kind() === TypeKind.SUM_TYPE) {
    baseTypeName = (targetType as SumType).name;
  } else if (targetType.kind() === TypeKind.HASH) {
    baseTypeName = 'Hash';
  }
  env.addImplementation(baseTypeName, node);

  const implementedMethods = new Map<string, FunctionType>();
  for (const methodNode of node.methods) {
    const methodName = methodNode.name?.value;
    if (!methodName) {
      return new ErrorType('methods in impl blocks must be named', methodNode);
    }
    const methodType = checkFunctionLiteral(methodNode, implEnv, loader, targetType);
    if (methodType.kind() === TypeKind.ERROR) return methodType;
    implementedMethods.set(methodName, methodType as FunctionType);
  }

  const traitSubstitutions = new Map<string, LumenType>();
  if (trait.typeParameters.length > 0 && node.trait instanceof ast.GenericTypeNode) {
    const traitArgs = (node.trait as ast.GenericTypeNode).typeParameters;
    if (trait.typeParameters.length !== traitArgs.length) {
      return new ErrorType(
        `incorrect number of type arguments for trait ${trait.name}`,
        node.trait,
      );
    }
    trait.typeParameters.forEach((param, i) => {
      const argType = typeNodeToLumenType(traitArgs[i], implEnv);
      traitSubstitutions.set(param.name, argType);
    });
  }

  for (const [requiredMethodName, requiredMethodType] of trait.methods.entries()) {
    const implementedMethod = implementedMethods.get(requiredMethodName);
    if (!implementedMethod) {
      return new ErrorType(
        `missing method '${requiredMethodName}' in implementation of trait '${trait.name}' for '${targetType.toString()}'`,
        node,
      );
    }

    const requiredParams = requiredMethodType.parameters.map((p) => {
      if (p instanceof TypeVariable && p.name === 'self') return targetType;
      return substitute(p, traitSubstitutions);
    });

    const requiredReturn = substitute(requiredMethodType.returnType, traitSubstitutions);
    const requiredFuncType = new FunctionType(requiredParams, requiredReturn, []);
    const substitutions = new Map<string, LumenType>();

    if (!unify(requiredFuncType, implementedMethod, substitutions)) {
      return new ErrorType(
        `method signature mismatch for '${requiredMethodName}'. Trait requires '${requiredFuncType.toString()}', implementation provides '${implementedMethod.toString()}'`,
        node.methods.find((m) => m.name?.value === requiredMethodName) ?? node,
      );
    }
  }

  return NULL_TYPE;
}

function checkTypeDeclaration(node: ast.TypeDeclarationStatement, env: TypeEnvironment): LumenType {
  const name = node.name.toString();
  if (env.get(name)) return new ErrorType(`Type ${name} is already defined.`, node.name);

  const typeDeclarationEnv = new TypeEnvironment(env);
  const typeParameters: TypeVariable[] = [];

  for (const tp of node.typeParameters) {
    const typeVar = new TypeVariable(tp.value);
    typeParameters.push(typeVar);
    typeDeclarationEnv.set(tp.value, typeVar, false);
  }

  const sumType = new SumType(name, typeParameters);
  env.set(name, sumType, false);

  for (const variantNode of node.variants) {
    const variantName = variantNode.name.value;
    if (sumType.variants.has(variantName))
      return new ErrorType(
        `Variant ${variantName} is already defined for type ${name}.`,
        variantNode,
      );

    const variantParamTypes: LumenType[] = [];
    for (const paramNode of variantNode.parameters) {
      const paramType = typeNodeToLumenType(paramNode, typeDeclarationEnv);
      if (paramType.kind() === TypeKind.ERROR) return paramType;
      variantParamTypes.push(paramType);
    }

    const variantType = new VariantType(variantName, variantParamTypes, sumType);
    sumType.variants.set(variantName, variantType);
    env.set(variantName, variantType, false);
  }

  return NULL_TYPE;
}

function checkFunctionLiteral(
  node: ast.FunctionLiteral,
  env: TypeEnvironment,
  loader: ModuleLoader,
  selfType?: LumenType,
  expectedType?: LumenType,
): LumenType {
  const functionEnv = new TypeEnvironment(env);
  const typeParameters: TypeVariable[] = [];

  let funcExpectedType: FunctionType | undefined;
  if (expectedType && expectedType.kind() === TypeKind.FUNCTION) {
    funcExpectedType = expectedType as FunctionType;
  }

  if (node.typeParameters) {
    for (const tpNode of node.typeParameters) {
      const typeVar = new TypeVariable(tpNode.name.value);
      typeParameters.push(typeVar);
      functionEnv.set(tpNode.name.value, typeVar, false);
    }
    for (let i = 0; i < node.typeParameters.length; i++) {
      const tpNode = node.typeParameters[i];
      const typeVar = typeParameters[i];
      const bounds: TraitType[] = [];
      for (const boundNode of tpNode.bounds) {
        const boundType = typeNodeToLumenType(boundNode, functionEnv);
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
  const isMethodWithSelf =
    selfType !== undefined && node.parameters.length > 0 && node.parameters[0].value === 'self';

  for (let i = 0; i < node.parameters.length; i++) {
    const p = node.parameters[i];

    if (i === 0 && isMethodWithSelf) {
      params.push(selfType);
      functionEnv.set(p.value, selfType, false);
      continue;
    }

    const expectedParamIndex = isMethodWithSelf ? i - 1 : i;

    if (p.typeAnnotation) {
      const paramType = typeNodeToLumenType(p.typeAnnotation, functionEnv);
      if (paramType.kind() === TypeKind.ERROR) return paramType;
      params.push(paramType);
      functionEnv.set(p.value, paramType, false);
    } else if (funcExpectedType && funcExpectedType.parameters[expectedParamIndex]) {
      const inferredType = funcExpectedType.parameters[expectedParamIndex];
      params.push(inferredType);
      functionEnv.set(p.value, inferredType, false);
    } else {
      return new ErrorType(
        `cannot infer type for parameter ${p.value}, please add a type annotation`,
        p,
      );
    }
  }

  let declaredReturnType: LumenType | undefined;
  if (node.returnType) {
    declaredReturnType = typeNodeToLumenType(node.returnType, functionEnv);
    functionEnv.currentFunctionReturnType = declaredReturnType;
  }

  const expectedBodyType =
    declaredReturnType || (funcExpectedType ? funcExpectedType.returnType : undefined);

  const bodyType = check(node.body, functionEnv, loader, expectedBodyType);
  if (bodyType.kind() === TypeKind.ERROR) return bodyType;

  const finalFuncType = new FunctionType(params, bodyType, typeParameters);

  if (funcExpectedType) {
    if (!unify(funcExpectedType, finalFuncType, new Map())) {
      if (declaredReturnType && !isSameType(declaredReturnType, bodyType)) {
        return new ErrorType(
          `type mismatch: function body returns ${bodyType.toString()} but is declared to return ${declaredReturnType.toString()}`,
          node.body,
        );
      }
    }
  } else if (declaredReturnType && !unify(declaredReturnType, bodyType, new Map())) {
    return new ErrorType(
      `type mismatch: function body returns ${bodyType.toString()} but is declared to return ${declaredReturnType.toString()}`,
      node.body,
    );
  }

  return finalFuncType;
}

export function check(
  node: ast.Node,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
  if (node instanceof ast.Program) {
    let result: LumenType = NULL_TYPE;
    if (node.statements[0] instanceof ast.ModuleStatement) {
      check(node.statements[0], env, loader);
    }

    for (const stmt of node.statements) {
      if (stmt instanceof ast.ModuleStatement) {
        continue;
      }
      result = check(stmt, env, loader);
      if (result.kind() === TypeKind.ERROR) return result;
    }
    return result;
  }

  if (node instanceof ast.ModuleStatement) {
    const exposed = new Set(node.exposing.map((ident) => ident.value));
    env.exposedNames = exposed;
    return NULL_TYPE;
  }

  if (node instanceof ast.UseStatement) {
    const moduleName = node.path.toString();
    const loaded = loader.load(moduleName);

    if (loaded instanceof Error) {
      return new ErrorType(loaded.message, node);
    }

    const moduleType = new ModuleType(moduleName, loaded.typeEnv);
    const bindName = node.path.parts[node.path.parts.length - 1].value;
    env.set(bindName, moduleType, false);

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

        if (binding) {
          env.set(name, binding.type, false);
        }

        if (constructor) {
          env.constructors.set(name, constructor);
          if (!binding) {
            env.set(name, constructor, false);
          }
        }

        if (!binding && !constructor) {
          return new ErrorType(`identifier '${name}' not found in module '${moduleName}'`, exposed);
        }
      }
    }

    return NULL_TYPE;
  }

  if (node instanceof ast.TypeDeclarationStatement) return checkTypeDeclaration(node, env);

  if (node instanceof ast.RecordDeclarationStatement) return checkRecordDeclaration(node, env);

  if (node instanceof ast.TraitDeclarationStatement) {
    return checkTraitDeclaration(node, env);
  }

  if (node instanceof ast.ImplementationStatement) {
    return checkImplementationStatement(node, env, loader);
  }

  if (node instanceof ast.BlockStatement) {
    if (node.statements.length === 0) {
      if (expectedType) return expectedType;
      return new ErrorType('cannot infer type of empty block', node);
    }

    let result: LumenType = NULL_TYPE;
    const lastIndex = node.statements.length - 1;

    for (let i = 0; i < node.statements.length; i++) {
      const stmt = node.statements[i];
      if (i === lastIndex) {
        result = check(stmt, env, loader, expectedType);
      } else {
        result = check(stmt, env, loader);
      }
      if (result.kind() === TypeKind.ERROR) {
        return result;
      }
    }
    return result;
  }

  if (node instanceof ast.ExpressionStatement)
    return check(node.expression, env, loader, expectedType);

  if (node instanceof ast.IntegerLiteral) return INTEGER_TYPE;
  if (node instanceof ast.DoubleLiteral) return DOUBLE_TYPE;
  if (node instanceof ast.BooleanLiteral) return BOOLEAN_TYPE;
  if (node instanceof ast.StringLiteral) return STRING_TYPE;
  if (node instanceof ast.FunctionLiteral) {
    return checkFunctionLiteral(node, env, loader, undefined, expectedType);
  }
  if (node instanceof ast.ArrayLiteral) {
    if (node.elements.length === 0) {
      if (expectedType && expectedType.kind() === TypeKind.ARRAY) return expectedType;
      return new ErrorType('cannot infer type of empty array without a type annotation', node);
    }
    const expectedElementType =
      expectedType?.kind() === TypeKind.ARRAY ? (expectedType as ArrayType).elementType : undefined;
    const firstElementType = check(node.elements[0], env, loader, expectedElementType);
    if (firstElementType.kind() === TypeKind.ERROR) return firstElementType;
    for (let i = 1; i < node.elements.length; i++) {
      const elType = check(node.elements[i], env, loader, firstElementType);
      if (elType.kind() === TypeKind.ERROR) return elType;
      if (!isSameType(elType, firstElementType))
        return new ErrorType(
          `arrays must be homogeneous. Found types ${firstElementType.toString()} and ${elType.toString()}`,
          node.elements[i],
        );
    }
    return new ArrayType(firstElementType);
  }
  if (node instanceof ast.HashLiteral) {
    if (node.pairs.size === 0) {
      if (expectedType && expectedType.kind() === TypeKind.HASH) return expectedType;
      return new ErrorType('cannot infer type of empty hash without a type annotation', node);
    }
    const expectedKeyType =
      expectedType?.kind() === TypeKind.HASH ? (expectedType as HashType).keyType : undefined;
    const expectedValueType =
      expectedType?.kind() === TypeKind.HASH ? (expectedType as HashType).valueType : undefined;
    const keys = [...node.pairs.keys()];
    const values = [...node.pairs.values()];
    const firstKeyType = check(keys[0], env, loader, expectedKeyType);
    if (firstKeyType.kind() === TypeKind.ERROR) return firstKeyType;
    if (
      firstKeyType.kind() !== TypeKind.STRING &&
      firstKeyType.kind() !== TypeKind.INTEGER &&
      firstKeyType.kind() !== TypeKind.BOOLEAN
    ) {
      return new ErrorType(`unusable as hash key: ${firstKeyType.toString()}`, keys[0]);
    }
    const firstValueType = check(values[0], env, loader, expectedValueType);
    if (firstValueType.kind() === TypeKind.ERROR) return firstValueType;
    for (let i = 1; i < keys.length; i++) {
      const keyType = check(keys[i], env, loader, firstKeyType);
      if (keyType.kind() === TypeKind.ERROR) return keyType;
      if (!isSameType(keyType, firstKeyType))
        return new ErrorType(
          `hash keys must be homogeneous. Found types ${firstKeyType.toString()} and ${keyType.toString()}`,
          keys[i],
        );
      const valueType = check(values[i], env, loader, firstValueType);
      if (valueType.kind() === TypeKind.ERROR) return valueType;
      if (!isSameType(valueType, firstValueType))
        return new ErrorType(
          `hash values must be homogeneous. Found types ${firstValueType.toString()} and ${valueType.toString()}`,
          values[i],
        );
    }
    return new HashType(firstKeyType, firstValueType);
  }

  if (node instanceof ast.MemberAccessExpression) {
    const objectType = check(node.object, env, loader);
    if (objectType.kind() === TypeKind.ERROR) return objectType;
    const propertyName = node.property.value;

    if (objectType.kind() === TypeKind.MODULE) {
      const moduleType = objectType as ModuleType;
      const binding = moduleType.env.get(propertyName);
      if (!binding) {
        return new ErrorType(
          `identifier '${propertyName}' not found in module '${moduleType.name}'`,
          node.property,
        );
      }
      if (moduleType.env.exposedNames && !moduleType.env.exposedNames.has(propertyName)) {
        return new ErrorType(
          `identifier '${propertyName}' is not exposed by module '${moduleType.name}'`,
          node.property,
        );
      }
      return binding.type;
    }

    if (objectType.kind() === TypeKind.RECORD) {
      const recordType = objectType as RecordType;
      const fieldType = recordType.fields.get(propertyName);
      if (fieldType) {
        return fieldType;
      }
    }

    if (objectType.kind() === TypeKind.TYPE_VARIABLE) {
      const traitsToCheck = (objectType as TypeVariable).bounds;
      for (const trait of traitsToCheck) {
        const methodType = trait.methods.get(propertyName);
        if (methodType) {
          const params = methodType.parameters.slice(1);
          const returnType = methodType.returnType;
          return new FunctionType(params, returnType);
        }
      }
    } else {
      let baseTypeName = objectType.toString();
      if (objectType.kind() === TypeKind.RECORD) {
        baseTypeName = (objectType as RecordType).name;
      } else if (objectType.kind() === TypeKind.SUM_TYPE) {
        baseTypeName = (objectType as SumType).name;
      } else if (objectType.kind() === TypeKind.HASH) {
        baseTypeName = 'Hash';
      }

      const implementations = env.getImplementationsForType(baseTypeName);

      for (const impl of implementations) {
        const traitName = getTraitNameFromTypeNode(impl.trait);
        const traitBinding = env.get(traitName);

        if (traitBinding && traitBinding.type.kind() === TypeKind.TRAIT) {
          const trait = traitBinding.type as TraitType;
          const methodType = trait.methods.get(propertyName);

          if (methodType) {
            const substitutions = new Map<string, LumenType>();
            const implEnv = new TypeEnvironment(env);
            if (impl.typeParameters) {
              for (const tpNode of impl.typeParameters) {
                const typeVar = new TypeVariable(tpNode.name.value);
                implEnv.set(tpNode.name.value, typeVar, false);
              }
            }

            const implTargetType = typeNodeToLumenType(impl.targetType, implEnv);
            if (!unify(objectType, implTargetType, substitutions)) {
              continue;
            }

            const genericParams = methodType.parameters.slice(1);
            const genericReturnType = methodType.returnType;

            const specializedParams = genericParams.map((p) => substitute(p, substitutions));
            const specializedReturnType = substitute(genericReturnType, substitutions);

            return new FunctionType(specializedParams, specializedReturnType, []);
          }
        }
      }
    }

    return new ErrorType(
      `no field or method '${propertyName}' found for type '${objectType.toString()}'`,
      node.property,
    );
  }

  if (node instanceof ast.LetStatement) {
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

  if (node instanceof ast.Identifier) {
    const constructor = env.constructors.get(node.value);
    if (constructor) {
      return constructor;
    }
    const binding = env.get(node.value);
    if (!binding) return new ErrorType(`identifier not found: ${node.value}`, node);
    return binding.type;
  }
  if (node instanceof ast.PrefixExpression) {
    const rightType = check(node.right, env, loader);
    if (rightType.kind() === TypeKind.ERROR) return rightType;
    if (node.operator === '!') return BOOLEAN_TYPE;
    if (node.operator === '-') {
      if (rightType.kind() !== TypeKind.INTEGER && rightType.kind() !== TypeKind.DOUBLE)
        return new ErrorType(
          `operator '-' cannot be applied to type ${rightType.toString()}`,
          node.right,
        );
      return rightType;
    }
    return new ErrorType(`unknown prefix operator: ${node.operator}`, node);
  }

  if (node instanceof ast.InfixExpression) {
    if (node.operator === '&&') {
      const leftType = check(node.left, env, loader, BOOLEAN_TYPE);
      if (leftType.kind() === TypeKind.ERROR) return leftType;
      if (!isSameType(leftType, BOOLEAN_TYPE)) {
        return new ErrorType(
          `left-hand side of '&&' must be a Boolean, but got ${leftType.toString()}`,
          node.left,
        );
      }
      const rightType = check(node.right, env, loader, BOOLEAN_TYPE);
      if (rightType.kind() === TypeKind.ERROR) return rightType;
      if (!isSameType(rightType, BOOLEAN_TYPE)) {
        return new ErrorType(
          `right-hand side of '&&' must be a Boolean, but got ${rightType.toString()}`,
          node.right,
        );
      }
      return BOOLEAN_TYPE;
    }

    if (node.operator === '|>') {
      const leftType = check(node.left, env, loader);
      if (leftType.kind() === TypeKind.ERROR) {
        return leftType;
      }

      const T = new TypeVariable('T');
      const expectedRightType = new FunctionType([leftType], T);
      const rightType = check(node.right, env, loader, expectedRightType);

      if (rightType.kind() === TypeKind.ERROR) {
        return rightType;
      }
      if (rightType.kind() !== TypeKind.FUNCTION) {
        return new ErrorType(
          `right-hand side of pipe must be a function, got ${rightType.toString()}`,
          node.right,
        );
      }

      const substitutions = new Map<string, LumenType>();
      if (!unify(expectedRightType, rightType, substitutions)) {
        return new ErrorType(
          `Cannot pipe '${leftType.toString()}' into function of type '${rightType.toString()}'`,
          node,
        );
      }

      return substitute(T, substitutions);
    }

    const leftType = check(node.left, env, loader);
    if (leftType.kind() === TypeKind.ERROR) {
      return leftType;
    }

    if (node.operator === '=' || node.operator === '+=') {
      if (node.left instanceof ast.Identifier) {
        const name = node.left.value;
        const binding = env.get(name);
        if (!binding) {
          return new ErrorType(`cannot assign to undeclared variable '${name}'`, node.left);
        }
        if (!binding.isMutable) {
          return new ErrorType(`cannot assign to immutable variable '${name}'`, node.left);
        }

        const rightType = check(node.right, env, loader, binding.type);
        if (rightType.kind() === TypeKind.ERROR) {
          return rightType;
        }

        if (node.operator === '+=') {
          const isNumeric = (t: LumenType) =>
            t.kind() === TypeKind.INTEGER || t.kind() === TypeKind.DOUBLE;
          if (!isNumeric(binding.type) || !isNumeric(rightType)) {
            return new ErrorType(
              `cannot apply operator '+=' to types ${binding.type.toString()} and ${rightType.toString()}`,
              node,
            );
          }
        } else {
          if (!isSameType(binding.type, rightType)) {
            return new ErrorType(
              `type mismatch: cannot assign ${rightType.toString()} to variable of type ${binding.type.toString()}`,
              node,
            );
          }
        }
        return rightType;
      }

      if (node.left instanceof ast.IndexExpression) {
        const collectionType = check(node.left.left, env, loader);
        if (collectionType.kind() === TypeKind.ERROR) return collectionType;

        if (collectionType.kind() === TypeKind.HASH) {
          const hashType = collectionType as HashType;
          const rightType = check(node.right, env, loader, hashType.valueType);
          if (rightType.kind() === TypeKind.ERROR) return rightType;

          if (!isSameType(hashType.valueType, rightType)) {
            return new ErrorType(
              `type mismatch: cannot assign value of type ${rightType.toString()} to hash value of type ${hashType.valueType.toString()}`,
              node,
            );
          }
          return rightType;
        }
        return new ErrorType(
          `assignment not supported for type ${collectionType.toString()}`,
          node.left.left,
        );
      }

      return new ErrorType('invalid assignment target', node.left);
    }

    if (node.left instanceof ast.IndexExpression) {
      if (leftType.kind() === TypeKind.ERROR) return leftType;

      const rightType = check(node.right, env, loader, leftType);
      if (rightType.kind() === TypeKind.ERROR) return rightType;

      if (!isSameType(leftType, rightType)) {
        return new ErrorType(
          `type mismatch: cannot assign value of type ${rightType.toString()} to index of type ${leftType.toString()}`,
          node,
        );
      }
      return rightType;
    }

    const rightType = check(node.right, env, loader);
    if (rightType.kind() === TypeKind.ERROR) {
      return rightType;
    }

    if (node.operator === '%') {
      if (leftType.kind() === TypeKind.INTEGER && rightType.kind() === TypeKind.INTEGER) {
        return INTEGER_TYPE;
      }
    }

    const isNumeric = (t: LumenType) =>
      t.kind() === TypeKind.INTEGER || t.kind() === TypeKind.DOUBLE;
    if (isNumeric(leftType) && isNumeric(rightType)) {
      if (['+', '-', '*', '/'].includes(node.operator)) {
        if (leftType.kind() === TypeKind.DOUBLE || rightType.kind() === TypeKind.DOUBLE) {
          return DOUBLE_TYPE;
        }
        return INTEGER_TYPE;
      }
      if (['<', '>', '==', '!=', '>=', '<='].includes(node.operator)) {
        return BOOLEAN_TYPE;
      }
    }

    if (leftType.kind() === TypeKind.STRING && rightType.kind() === TypeKind.STRING) {
      if (node.operator === '+') return STRING_TYPE;
    }

    if (['==', '!='].includes(node.operator)) {
      if (leftType.kind() === TypeKind.NULL || rightType.kind() === TypeKind.NULL) {
        return BOOLEAN_TYPE;
      }
      if (isSameType(leftType, rightType)) return BOOLEAN_TYPE;
    }

    return new ErrorType(
      `type mismatch: cannot apply operator ${
        node.operator
      } to types ${leftType.toString()} and ${rightType.toString()}`,
      node,
    );
  }
  if (node instanceof ast.IndexExpression) {
    const leftType = check(node.left, env, loader);
    if (leftType.kind() === TypeKind.ERROR) return leftType;
    if (leftType.kind() === TypeKind.ARRAY) {
      const indexType = check(node.index, env, loader, INTEGER_TYPE);
      if (indexType.kind() === TypeKind.ERROR) return indexType;
      if (!isSameType(indexType, INTEGER_TYPE))
        return new ErrorType(
          `array index must be an Integer, but got ${indexType.toString()}`,
          node.index,
        );
      return (leftType as ArrayType).elementType;
    }
    if (leftType.kind() === TypeKind.HASH) {
      const hashType = leftType as HashType;
      const indexType = check(node.index, env, loader, hashType.keyType);
      if (indexType.kind() === TypeKind.ERROR) return indexType;
      if (!isSameType(indexType, hashType.keyType))
        return new ErrorType(
          `hash key mismatch: expected ${hashType.keyType.toString()}, but got ${indexType.toString()}`,
          node.index,
        );
      return hashType.valueType;
    }
    return new ErrorType(`index operator not supported for type ${leftType.toString()}`, node.left);
  }
  if (node instanceof ast.IfExpression) {
    const conditionType = check(node.condition, env, loader, BOOLEAN_TYPE);
    if (conditionType.kind() === TypeKind.ERROR) return conditionType;
    if (!isSameType(conditionType, BOOLEAN_TYPE))
      return new ErrorType(
        `condition of if-expression must be a Boolean, but got ${conditionType.toString()}`,
        node.condition,
      );
    const consequenceType = check(node.consequence, env, loader, expectedType);
    if (consequenceType.kind() === TypeKind.ERROR) return consequenceType;
    if (!node.alternative) return new ErrorType('if-expressions must have an else branch', node);

    const alternativeType = check(node.alternative, env, loader, expectedType);

    if (alternativeType.kind() === TypeKind.ERROR) return alternativeType;
    if (!isSameType(consequenceType, alternativeType))
      return new ErrorType(
        `branches of if-expression must have the same type, but got ${consequenceType.toString()} and ${alternativeType.toString()}`,
        node,
      );
    return consequenceType;
  }

  if (node instanceof ast.CallExpression) {
    if (node.func instanceof ast.Identifier) {
      const funcName = node.func.value;
      switch (funcName) {
        case 'writeln': {
          for (const arg of node.args) {
            const argType = check(arg, env, loader);
            if (argType.kind() === TypeKind.ERROR) return argType;
          }
          return NULL_TYPE;
        }
        case 'len': {
          if (node.args.length !== 1) {
            return new ErrorType(`wrong number of arguments for 'len': expected 1`, node);
          }
          const argTypeLen = check(node.args[0], env, loader);
          if (argTypeLen.kind() === TypeKind.ERROR) return argTypeLen;
          if (argTypeLen.kind() !== TypeKind.ARRAY && argTypeLen.kind() !== TypeKind.STRING) {
            return new ErrorType(
              `argument to 'len' must be an Array or String, but got ${argTypeLen.toString()}`,
              node.args[0],
            );
          }
          return INTEGER_TYPE;
        }
        case 'first':
        case 'rest': {
          if (node.args.length !== 1)
            return new ErrorType(`wrong number of arguments for '${funcName}': expected 1`, node);
          const argTypeFirstRest = check(node.args[0], env, loader);
          if (argTypeFirstRest.kind() === TypeKind.ERROR) return argTypeFirstRest;
          if (argTypeFirstRest.kind() !== TypeKind.ARRAY)
            return new ErrorType(
              `argument to '${funcName}' must be an array, but got ${argTypeFirstRest.toString()}`,
              node.args[0],
            );
          const arrayType = argTypeFirstRest as ArrayType;
          return funcName === 'first' ? arrayType.elementType : arrayType;
        }
        case 'prepend': {
          if (node.args.length !== 2) {
            return new ErrorType(`wrong number of arguments for 'prepend': expected 2`, node);
          }
          const elementType = check(node.args[0], env, loader);
          if (elementType.kind() === TypeKind.ERROR) return elementType;
          const arrayTypePrepend = check(node.args[1], env, loader, new ArrayType(elementType));
          if (arrayTypePrepend.kind() === TypeKind.ERROR) return arrayTypePrepend;
          if (arrayTypePrepend.kind() !== TypeKind.ARRAY) {
            return new ErrorType(
              `second argument to 'prepend' must be an array, got ${arrayTypePrepend.toString()}`,
              node.args[1],
            );
          }
          if (!isSameType((arrayTypePrepend as ArrayType).elementType, elementType)) {
            return new ErrorType(
              `type mismatch in 'prepend': element type is ${elementType.toString()} but array element type is ${(arrayTypePrepend as ArrayType).elementType}`,
              node,
            );
          }
          return arrayTypePrepend;
        }
        case 'strFormat': {
          if (node.args.length < 1) {
            return new ErrorType("'strFormat' expects at least 1 argument", node);
          }
          const formatStringType = check(node.args[0], env, loader, STRING_TYPE);
          if (formatStringType.kind() === TypeKind.ERROR) return formatStringType;
          if (formatStringType.kind() !== TypeKind.STRING) {
            return new ErrorType(
              `first argument to 'strFormat' must be a String, got ${formatStringType.toString()}`,
              node.args[0],
            );
          }
          for (let i = 1; i < node.args.length; i++) {
            const argType = check(node.args[i], env, loader);
            if (argType.kind() === TypeKind.ERROR) return argType;
          }
          return STRING_TYPE;
        }
      }
    }

    if (node.func instanceof ast.FunctionLiteral) {
      const argTypes: LumenType[] = [];
      for (const arg of node.args) {
        const argType = check(arg, env, loader);
        if (argType.kind() === TypeKind.ERROR) return argType;
        argTypes.push(argType);
      }
      const returnTypeVar = new TypeVariable('T_return');
      const expectedFuncType = new FunctionType(argTypes, returnTypeVar);
      const funcType = check(node.func, env, loader, expectedFuncType);
      if (funcType.kind() === TypeKind.ERROR) return funcType;
      if (funcType.kind() !== TypeKind.FUNCTION)
        return new ErrorType('This should be a function', node.func);

      return (funcType as FunctionType).returnType;
    } else {
      const funcType = check(node.func, env, loader);
      if (funcType.kind() === TypeKind.ERROR) return funcType;

      if (funcType.kind() === TypeKind.VARIANT_TYPE) {
        const variantType = funcType as VariantType;
        if (node.args.length !== variantType.parameters.length)
          return new ErrorType(
            `wrong number of arguments for variant ${variantType.name}: expected ${variantType.parameters.length}, got ${node.args.length}`,
            node,
          );

        const substitutions = new Map<string, LumenType>();
        unify(
          variantType.parent,
          expectedType ?? new SumType(variantType.parent.name, variantType.parent.typeParameters),
          substitutions,
        );

        for (let i = 0; i < node.args.length; i++) {
          const paramType = substitute(variantType.parameters[i], substitutions);
          const argType = check(node.args[i], env, loader, paramType);
          if (argType.kind() === TypeKind.ERROR) return argType;
          if (!unify(paramType, argType, substitutions))
            return new ErrorType(
              `type mismatch in argument ${i + 1} for variant ${variantType.name}: expected ${paramType.toString()}, got ${argType.toString()}`,
              node.args[i],
            );
        }
        return substitute(variantType.parent, substitutions);
      }

      if (funcType.kind() !== TypeKind.FUNCTION)
        return new ErrorType(`cannot call non-function type: ${funcType.toString()}`, node.func);

      const fnType = funcType as FunctionType;

      if (node.args.length !== fnType.parameters.length)
        return new ErrorType(
          `wrong number of arguments: expected ${fnType.parameters.length}, got ${node.args.length}`,
          node,
        );

      const substitutions = new Map<string, LumenType>();

      if (expectedType && fnType.typeParameters.length > 0) {
        unify(fnType.returnType, expectedType, substitutions);
      }

      for (let i = 0; i < node.args.length; i++) {
        const argNode = node.args[i];
        let paramType = fnType.parameters[i];
        paramType = substitute(paramType, substitutions);

        const argType = check(argNode, env, loader, paramType);
        if (argType.kind() === TypeKind.ERROR) return argType;

        const originalParamType = fnType.parameters[i];
        if (!unify(originalParamType, argType, substitutions)) {
          return new ErrorType(
            `Could not unify ${substitute(originalParamType, substitutions).toString()} with ${argType.toString()}`,
            argNode,
          );
        }

        if (originalParamType.kind() === TypeKind.TYPE_VARIABLE) {
          const varName = (originalParamType as TypeVariable).name;
          const typeVarDef = fnType.typeParameters.find((p) => p.name === varName);

          if (typeVarDef) {
            const concreteType = substitute(typeVarDef, substitutions);
            if (concreteType.kind() !== TypeKind.TYPE_VARIABLE) {
              for (const bound of typeVarDef.bounds) {
                const concreteBound = substitute(bound, substitutions) as TraitType;
                if (!env.hasImplementation(concreteType, concreteBound, substitutions)) {
                  return new ErrorType(
                    `type ${concreteType.toString()} does not implement trait ${concreteBound.toString()}`,
                    argNode,
                  );
                }
              }
            }
          }
        }
      }

      for (const typeVar of fnType.typeParameters) {
        const concreteType = substitute(typeVar, substitutions);
        if (concreteType.kind() === TypeKind.TYPE_VARIABLE) {
          if (typeVar.bounds.length > 0) {
            return new ErrorType(
              `could not infer type for generic parameter ${typeVar.name}`,
              node,
            );
          }
          continue;
        }
        for (const bound of typeVar.bounds) {
          const concreteBound = substitute(bound, substitutions) as TraitType;
          if (!env.hasImplementation(concreteType, concreteBound, substitutions)) {
            return new ErrorType(
              `type ${concreteType.toString()} does not implement trait ${concreteBound.toString()}`,
              node,
            );
          }
        }
      }
      return substitute(fnType.returnType, substitutions);
    }
  }

  if (node instanceof ast.TryExpression) {
    const leftType = check(node.left, env, loader);
    if (leftType.kind() === TypeKind.ERROR) return leftType;

    if (leftType.kind() !== TypeKind.SUM_TYPE || (leftType as SumType).name !== 'Result') {
      return new ErrorType(
        `operator '?' can only be used on a Result type, but got ${leftType.toString()}`,
        node.left,
      );
    }

    const resultType = leftType as SumType;
    const okTypeArgument = resultType.typeArguments[0];
    const errTypeArgument = resultType.typeArguments[1];

    if (!okTypeArgument || !errTypeArgument) {
      return new ErrorType('Could not determine the types of the Result.', node);
    }

    const funcReturnType = env.currentFunctionReturnType;
    if (
      !funcReturnType ||
      funcReturnType.kind() !== TypeKind.SUM_TYPE ||
      (funcReturnType as SumType).name !== 'Result'
    ) {
      return new ErrorType(
        `operator '?' can only be used inside a function that returns a Result type`,
        node,
      );
    }

    const expectedErrType = (funcReturnType as SumType).typeArguments[1];
    if (!unify(expectedErrType, errTypeArgument, new Map())) {
      return new ErrorType(
        `cannot propagate error of type ${errTypeArgument.toString()}, function expects to return error of type ${expectedErrType.toString()}`,
        node,
      );
    }

    return okTypeArgument;
  }

  if (node instanceof ast.MatchExpression)
    return checkMatchExpression(node, env, loader, expectedType);
  if (node instanceof ast.WhenExpression) return checkWhenExpression(node, env, loader);

  return new ErrorType(`type checking not implemented for ${node.constructor.name}`, node);
}

function checkWhenExpression(
  node: ast.WhenExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  let commonBranchType: LumenType | undefined = undefined;

  const processBranch = (body: ast.Expression): LumenType | undefined => {
    const bodyType = check(body, env, loader);
    if (bodyType.kind() === TypeKind.ERROR) {
      return bodyType;
    }

    if (!commonBranchType) {
      commonBranchType = bodyType;
      return undefined;
    }

    if (isSameType(commonBranchType, bodyType)) {
      if (bodyType.kind() === TypeKind.DOUBLE) {
        commonBranchType = DOUBLE_TYPE;
      }
      return undefined;
    }

    const substitutions = new Map<string, LumenType>();
    if (unify(commonBranchType, bodyType, substitutions)) {
      commonBranchType = substitute(commonBranchType, substitutions);
      return undefined;
    }

    return new ErrorType(
      `when branches must have compatible types. Expected ${commonBranchType.toString()} but got ${bodyType.toString()}`,
      body,
    );
  };

  if (node.subject) {
    const subjectType = check(node.subject, env, loader);
    if (subjectType.kind() === TypeKind.ERROR) {
      return subjectType;
    }

    for (const branch of node.branches) {
      for (const pattern of branch.patterns) {
        const patternType = check(pattern, env, loader);
        if (patternType.kind() === TypeKind.ERROR) return patternType;
        
        if (patternType.kind() !== TypeKind.BOOLEAN) {
            if (!isSameType(subjectType, patternType)) {
                return new ErrorType(
                    `this pattern has type ${patternType.toString()}, but the subject has type ${subjectType.toString()}. Patterns must either be comparable to the subject or be a boolean condition.`,
                    pattern,
                );
            }
        }
      }
      const error = processBranch(branch.body);
      if (error) return error;
    }
  } else {
    for (const branch of node.branches) {
      const condition = branch.patterns[0];
      const conditionType = check(condition, env, loader, BOOLEAN_TYPE);
      if (conditionType.kind() === TypeKind.ERROR) return conditionType;
      if (!isSameType(conditionType, BOOLEAN_TYPE)) {
        return new ErrorType(
          `when branch condition must be a Boolean, but got ${conditionType.toString()}`,
          condition,
        );
      }
      const error = processBranch(branch.body);
      if (error) return error;
    }
  }

  const elseError = processBranch(node.elseBody);
  if (elseError) return elseError;

  return commonBranchType || NULL_TYPE;
}

function checkMatchExpression(
  node: ast.MatchExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
  if (node.values.length !== 1) {
    return new ErrorType(`match on tuples is not yet supported by the typechecker`, node);
  }
  const valueNode = node.values[0];
  const valueType = check(valueNode, env, loader);
  if (valueType.kind() === TypeKind.ERROR) return valueType;

  let firstArmType: LumenType | undefined = undefined;
  const substitutions = new Map<string, LumenType>();

  if (valueType.kind() === TypeKind.SUM_TYPE) {
    const sumType = valueType as SumType;
    const coveredVariants = new Set<string>();
    let hasWildcard = false;

    const sumTypeBinding = env.get(sumType.name);
    if (!sumTypeBinding || sumTypeBinding.type.kind() !== TypeKind.SUM_TYPE) {
      return new ErrorType(`Could not find definition for type ${sumType.name}`, valueNode);
    }
    const sumTypeDef = sumTypeBinding.type as SumType;

    for (const arm of node.arms) {
      const armEnv = new TypeEnvironment(env);

      if (arm.pattern instanceof ast.WildcardPattern) {
        hasWildcard = true;
      } else if (arm.pattern instanceof ast.VariantPattern) {
        const pattern = arm.pattern;
        const variantName = pattern.path.value;
        const genericVariantType = sumTypeDef.variants.get(variantName);
        if (!genericVariantType)
          return new ErrorType(`${sumType.name} has no variant named ${variantName}`, pattern.path);

        const variantSubstitutions = new Map<string, LumenType>();
        unify(sumTypeDef, valueType, variantSubstitutions);

        const variantType = substitute(genericVariantType, variantSubstitutions) as VariantType;

        if (pattern.parameters.length !== variantType.parameters.length)
          return new ErrorType(
            `variant ${variantName} expects ${variantType.parameters.length} parameters, but pattern provides ${pattern.parameters.length}`,
            pattern,
          );
        coveredVariants.add(variantName);
        pattern.parameters.forEach((param, i) => {
          const paramType = variantType.parameters[i];
          armEnv.set(param.value, paramType, false);
        });
      } else if (arm.pattern instanceof ast.ArrayPattern) {
        return new ErrorType('Array patterns cannot be used to match a custom type.', arm.pattern);
      } else {
        return new ErrorType(`Unsupported pattern type in match for ${sumType.name}`, arm.pattern);
      }

      const expectedArmType = firstArmType ? substitute(firstArmType, substitutions) : expectedType;
      const armBodyType = check(arm.body, armEnv, loader, expectedArmType);
      if (armBodyType.kind() === TypeKind.ERROR) return armBodyType;

      if (!firstArmType) {
        firstArmType = armBodyType;
      } else if (!unify(firstArmType, armBodyType, substitutions)) {
        return new ErrorType(
          `match arms must have the same type. Expected ${substitute(
            firstArmType,
            substitutions,
          ).toString()} but got ${armBodyType.toString()}`,
          arm.body,
        );
      }
    }

    const allVariants = new Set(sumTypeDef.variants.keys());
    if (!hasWildcard && coveredVariants.size < allVariants.size) {
      const missing = [...allVariants].filter((v) => !coveredVariants.has(v));
      return new ErrorType(
        `match is not exhaustive. Missing patterns: ${missing.join(', ')}`,
        node,
      );
    }
  } else if (valueType.kind() === TypeKind.ARRAY) {
    const arrayType = valueType as ArrayType;
    const elementType = arrayType.elementType;

    for (const arm of node.arms) {
      const armEnv = new TypeEnvironment(env);

      if (arm.pattern instanceof ast.ArrayPattern) {
        const pattern = arm.pattern;
        pattern.elements.forEach((el) => {
          armEnv.set(el.value, elementType, false);
        });
        if (pattern.rest) {
          armEnv.set(pattern.rest.value, arrayType, false);
        }
      } else if (!(arm.pattern instanceof ast.WildcardPattern)) {
        return new ErrorType(
          `invalid pattern for Array type: ${arm.pattern.toString()}`,
          arm.pattern,
        );
      }

      const expectedArmType = firstArmType ? substitute(firstArmType, substitutions) : expectedType;
      const armBodyType = check(arm.body, armEnv, loader, expectedArmType);
      if (armBodyType.kind() === TypeKind.ERROR) return armBodyType;

      if (!firstArmType) {
        firstArmType = armBodyType;
      } else if (!unify(firstArmType, armBodyType, substitutions)) {
        return new ErrorType(
          `match arms must have the same type. Expected ${substitute(
            firstArmType,
            substitutions,
          ).toString()} but got ${armBodyType.toString()}`,
          arm.body,
        );
      }
    }
  } else {
    return new ErrorType(
      `match expressions are not supported for type ${valueType.toString()}`,
      valueNode,
    );
  }

  return firstArmType ? substitute(firstArmType, substitutions) : NULL_TYPE;
}
