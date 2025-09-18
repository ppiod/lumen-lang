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
  TupleType,
  ModuleType,
  ANY_TYPE,
} from '@syntax/type.js';
import { TypeEnvironment } from '../environment.js';
import { ModuleLoader } from '../../../loader.js';
import { check } from '../typechecker.js';
import { isSameType, substitute, typeNodeToLumenType, unify } from '../utils.js';

export function checkFunctionLiteral(
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

export function checkArrayLiteral(
  node: ast.ArrayLiteral,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
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

export function checkHashLiteral(
  node: ast.HashLiteral,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
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

export function checkMemberAccessExpression(
  node: ast.MemberAccessExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
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
  
  if (objectType.kind() === TypeKind.HASH) {
    const hashType = objectType as HashType;
    if (hashType.keyType.kind() !== TypeKind.STRING) {
      return new ErrorType(
        `dot notation access is only supported for hashes with String keys, but this hash has keys of type ${hashType.keyType.toString()}`,
        node.property,
      );
    }
    return hashType.valueType;
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

    const implementationBindings = env.getImplementationsForType(baseTypeName);

    for (const binding of implementationBindings) {
      const { impl, env: implEnv } = binding;

      const traitType = typeNodeToLumenType(impl.trait, implEnv);

      if (traitType && traitType.kind() === TypeKind.TRAIT) {
        const trait = traitType as TraitType;
        const methodType = trait.methods.get(propertyName);

        if (methodType) {
          const substitutions = new Map<string, LumenType>();

          const tempImplEnv = new TypeEnvironment(implEnv);
          if (impl.typeParameters) {
            for (const tpNode of impl.typeParameters) {
              const typeVar = new TypeVariable(tpNode.name.value);
              tempImplEnv.set(tpNode.name.value, typeVar, false);
            }
          }

          const implTargetType = typeNodeToLumenType(impl.targetType, tempImplEnv);
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

export function checkPrefixExpression(
  node: ast.PrefixExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
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

export function checkInfixExpression(
  node: ast.InfixExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  if (['==', '!=', '<', '>', '<=', '>='].includes(node.operator)) {
    const leftType = check(node.left, env, loader);
    if (leftType.kind() === TypeKind.ERROR) return leftType;
    const rightType = check(node.right, env, loader);
    if (rightType.kind() === TypeKind.ERROR) return rightType;
    return BOOLEAN_TYPE;
  }

  if (node.operator === '&&' || node.operator === '||') {
    const leftType = check(node.left, env, loader, BOOLEAN_TYPE);
    if (leftType.kind() === TypeKind.ERROR) return leftType;
    if (!isSameType(leftType, BOOLEAN_TYPE)) {
      return new ErrorType(
        `left-hand side of '${node.operator}' must be a Boolean, but got ${leftType.toString()}`,
        node.left,
      );
    }
    const rightType = check(node.right, env, loader, BOOLEAN_TYPE);
    if (rightType.kind() === TypeKind.ERROR) return rightType;
    if (!isSameType(rightType, BOOLEAN_TYPE)) {
      return new ErrorType(
        `right-hand side of '${node.operator}' must be a Boolean, but got ${rightType.toString()}`,
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

  const isNumeric = (t: LumenType) => t.kind() === TypeKind.INTEGER || t.kind() === TypeKind.DOUBLE;
  if (isNumeric(leftType) && isNumeric(rightType)) {
    if (['+', '-', '*', '/'].includes(node.operator)) {
      if (leftType.kind() === TypeKind.DOUBLE || rightType.kind() === TypeKind.DOUBLE) {
        return DOUBLE_TYPE;
      }
      return INTEGER_TYPE;
    }
  }

  if (leftType.kind() === TypeKind.STRING && rightType.kind() === TypeKind.STRING) {
    if (node.operator === '+') return STRING_TYPE;
  }

  return new ErrorType(
    `type mismatch: cannot apply operator ${
      node.operator
    } to types ${leftType.toString()} and ${rightType.toString()}`,
    node,
  );
}

export function checkIndexExpression(
  node: ast.IndexExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
  const leftType = check(node.left, env, loader);
  if (leftType.kind() === TypeKind.ERROR) return leftType;
  if (leftType.kind() === TypeKind.ANY || leftType.kind() === TypeKind.TYPE_VARIABLE)
    return ANY_TYPE;

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

export function checkCallExpression(
  node: ast.CallExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
  if (node.func instanceof ast.Identifier) {
    const funcName = node.func.value;
    switch (funcName) {
      case 'writeln':
      case 'write': {
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
          return new ErrorType(`could not infer type for generic parameter ${typeVar.name}`, node);
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

export function checkTryExpression(
  node: ast.TryExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
): LumenType {
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

export function checkTupleLiteral(
  node: ast.TupleLiteral,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
  const elementTypes: LumenType[] = [];

  let expectedElementTypes: LumenType[] | undefined;
  if (expectedType && expectedType.kind() === TypeKind.TUPLE) {
    expectedElementTypes = (expectedType as TupleType).elementTypes;
  }

  for (let i = 0; i < node.elements.length; i++) {
    const element = node.elements[i];
    const expectedElementType = expectedElementTypes ? expectedElementTypes[i] : undefined;
    const elType = check(element, env, loader, expectedElementType);
    if (elType.kind() === TypeKind.ERROR) return elType;
    elementTypes.push(elType);
  }
  return new TupleType(elementTypes);
}
