import * as ast from '@syntax/ast.js';
import {
  ArrayType,
  FunctionType,
  HashType,
  type LumenType,
  SumType,
  TypeKind,
  TypeVariable,
  VariantType,
  ErrorType,
  INTEGER_TYPE,
  DOUBLE_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  NULL_TYPE,
  ModuleType,
  RecordType,
  TraitType,
  ANY_TYPE,
  TupleType,
} from '@syntax/type.js';
import { TypeEnvironment } from './environment.js';

export function isSameType(a: LumenType, b: LumenType): boolean {
  if (
    a.kind() === TypeKind.ANY ||
    b.kind() === TypeKind.ANY ||
    a.kind() === TypeKind.TYPE_VARIABLE ||
    b.kind() === TypeKind.TYPE_VARIABLE
  ) {
    return true;
  }

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

export function getTraitNameFromTypeNode(node: ast.TypeNode): string {
  if (node instanceof ast.GenericTypeNode) {
    return node.value;
  }
  if (node instanceof ast.PathTypeNode) {
    return node.baseName();
  }
  if (node instanceof ast.Identifier) {
    return node.value;
  }
  return node.toString();
}

export function substitute(
  type: LumenType,
  substitutions: Map<string, LumenType>,
  memo: Map<LumenType, LumenType> = new Map(),
): LumenType {
  if (memo.has(type)) {
    return memo.get(type)!;
  }

  if (type.kind() === TypeKind.TYPE_VARIABLE) {
    const resolved = substitutions.get((type as TypeVariable).name);
    if (resolved) {
      memo.set(type, type);
      const finalType = substitute(resolved, substitutions, memo);
      memo.set(type, finalType);
      return finalType;
    }
    return type;
  }

  memo.set(type, type);

  let result: LumenType;

  if (type.kind() === TypeKind.TUPLE) {
    const tupleType = type as TupleType;
    const newElementTypes = tupleType.elementTypes.map((et) => substitute(et, substitutions, memo));
    result = new TupleType(newElementTypes);
  } else if (type.kind() === TypeKind.ARRAY) {
    const arrType = type as ArrayType;
    const newElementType = substitute(arrType.elementType, substitutions, memo);
    result = new ArrayType(newElementType);
  } else if (type.kind() === TypeKind.FUNCTION) {
    const funcType = type as FunctionType;
    const newParams = funcType.parameters.map((p) => substitute(p, substitutions, memo));
    const newReturn = substitute(funcType.returnType, substitutions, memo);
    result = new FunctionType(newParams, newReturn, funcType.typeParameters);
  } else if (type.kind() === TypeKind.RECORD) {
    const recordType = type as RecordType;
    const sourceTypes =
      recordType.typeArguments.length > 0 ? recordType.typeArguments : recordType.typeParameters;
    const newTypeArguments = sourceTypes.map((p) => substitute(p, substitutions, memo));
    const newFields = new Map<string, LumenType>();
    recordType.fields.forEach((fieldType, fieldName) => {
      newFields.set(fieldName, substitute(fieldType, substitutions, memo));
    });
    result = new RecordType(
      recordType.name,
      newFields,
      recordType.fieldOrder,
      recordType.typeParameters,
      newTypeArguments,
    );
  } else if (type.kind() === TypeKind.SUM_TYPE) {
    const sumType = type as SumType;
    const sourceTypes =
      sumType.typeArguments.length > 0 ? sumType.typeArguments : sumType.typeParameters;
    const newTypeArguments = sourceTypes.map((p) => substitute(p, substitutions, memo));
    const instantiatedSumType = new SumType(sumType.name, sumType.typeParameters, newTypeArguments);
    memo.set(type, instantiatedSumType);
    for (const [variantName, genericVariant] of sumType.variants.entries()) {
      const instantiatedParams = genericVariant.parameters.map((p) =>
        substitute(p, substitutions, memo),
      );
      const instantiatedVariant = new VariantType(
        variantName,
        instantiatedParams,
        instantiatedSumType,
      );
      instantiatedSumType.variants.set(variantName, instantiatedVariant);
    }
    result = instantiatedSumType;
  } else if (type.kind() === TypeKind.VARIANT_TYPE) {
    const variantType = type as VariantType;
    const newParams = variantType.parameters.map((p) => substitute(p, substitutions, memo));
    const newParent = substitute(variantType.parent, substitutions, memo) as SumType;
    result = new VariantType(variantType.name, newParams, newParent);
  } else if (type.kind() === TypeKind.TRAIT) {
    const traitType = type as TraitType;
    const newTypeArguments = traitType.typeArguments.map((p) => substitute(p, substitutions, memo));
    result = new TraitType(traitType.name, traitType.typeParameters, newTypeArguments);
    (result as TraitType).methods = traitType.methods;
  } else {
    memo.delete(type);
    return type;
  }

  memo.set(type, result);
  return result;
}

export function unify(
  t1: LumenType,
  t2: LumenType,
  substitutions: Map<string, LumenType>,
): boolean {
  const finalT1 = substitute(t1, substitutions);
  const finalT2 = substitute(t2, substitutions);

  if (finalT1.kind() === TypeKind.ANY || finalT2.kind() === TypeKind.ANY) {
    return true;
  }

  if (finalT1.kind() === TypeKind.TYPE_VARIABLE) {
    const name = (finalT1 as TypeVariable).name;
    const existing = substitutions.get(name);
    if (existing) {
      return unify(existing, finalT2, substitutions);
    }
    if (finalT2.kind() === TypeKind.TYPE_VARIABLE && (finalT2 as TypeVariable).name === name) {
      return true;
    }
    substitutions.set(name, finalT2);
    return true;
  }

  if (finalT2.kind() === TypeKind.TYPE_VARIABLE) {
    return unify(finalT2, finalT1, substitutions);
  }

  if (finalT1.kind() === TypeKind.DOUBLE && finalT2.kind() === TypeKind.INTEGER) {
    return true;
  }

  if (finalT1.kind() !== finalT2.kind()) return false;

  if (finalT1.kind() === TypeKind.ARRAY && finalT2.kind() === TypeKind.ARRAY) {
    return unify(
      (finalT1 as ArrayType).elementType,
      (finalT2 as ArrayType).elementType,
      substitutions,
    );
  }

  if (finalT1.kind() === TypeKind.HASH && finalT2.kind() === TypeKind.HASH) {
    const hash1 = finalT1 as HashType;
    const hash2 = finalT2 as HashType;
    if (!unify(hash1.keyType, hash2.keyType, substitutions)) {
      return false;
    }
    return unify(hash1.valueType, hash2.valueType, substitutions);
  }

  if (finalT1.kind() === TypeKind.SUM_TYPE && finalT2.kind() === TypeKind.SUM_TYPE) {
    const sum1 = finalT1 as SumType;
    const sum2 = finalT2 as SumType;

    if (sum1.name !== sum2.name) return false;

    const args1 = sum1.typeArguments;
    const args2 = sum2.typeArguments;
    const params1 = sum1.typeParameters;
    const params2 = sum2.typeParameters;

    const list1 = args1.length > 0 ? args1 : params1;
    const list2 = args2.length > 0 ? args2 : params2;

    if (list1.length !== list2.length) return false;

    for (let i = 0; i < list1.length; i++) {
      if (!unify(list1[i], list2[i], substitutions)) return false;
    }

    return true;
  }

  if (finalT1.kind() === TypeKind.RECORD && finalT2.kind() === TypeKind.RECORD) {
    const rec1 = finalT1 as RecordType;
    const rec2 = finalT2 as RecordType;

    if (rec1.name !== rec2.name) return false;

    const args1 = rec1.typeArguments;
    const args2 = rec2.typeArguments;
    const params1 = rec1.typeParameters;
    const params2 = rec2.typeParameters;

    const list1 = args1.length > 0 ? args1 : params1;
    const list2 = args2.length > 0 ? args2 : params2;

    if (list1.length !== list2.length) return false;

    for (let i = 0; i < list1.length; i++) {
      if (!unify(list1[i], list2[i], substitutions)) return false;
    }

    return true;
  }

  if (finalT1.kind() === TypeKind.TRAIT && finalT2.kind() === TypeKind.TRAIT) {
    const trait1 = finalT1 as TraitType;
    const trait2 = finalT2 as TraitType;

    if (trait1.name !== trait2.name) return false;

    const args1 = trait1.typeArguments;
    const args2 = trait2.typeArguments;
    const params1 = trait1.typeParameters;
    const params2 = trait2.typeParameters;

    const list1 = args1.length > 0 ? args1 : params1;
    const list2 = args2.length > 0 ? args2 : params2;

    if (list1.length !== list2.length) return false;

    for (let i = 0; i < list1.length; i++) {
      if (!unify(list1[i], list2[i], substitutions)) return false;
    }

    return true;
  }

  if (finalT1.kind() === TypeKind.FUNCTION && finalT2.kind() === TypeKind.FUNCTION) {
    const func1 = finalT1 as FunctionType;
    const func2 = finalT2 as FunctionType;
    if (func1.parameters.length !== func2.parameters.length) return false;
    for (let i = 0; i < func1.parameters.length; i++) {
      if (!unify(func1.parameters[i], func2.parameters[i], substitutions)) {
        return false;
      }
    }
    return unify(func1.returnType, func2.returnType, substitutions);
  }

  if (finalT1.kind() === TypeKind.TUPLE && finalT2.kind() === TypeKind.TUPLE) {
    const tuple1 = finalT1 as TupleType;
    const tuple2 = finalT2 as TupleType;
    if (tuple1.elementTypes.length !== tuple2.elementTypes.length) return false;
    for (let i = 0; i < tuple1.elementTypes.length; i++) {
      if (!unify(tuple1.elementTypes[i], tuple2.elementTypes[i], substitutions)) {
        return false;
      }
    }
    return true;
  }

  return true;
}

export function typeNodeToLumenType(node: ast.TypeNode, env: TypeEnvironment): LumenType {
  if (node instanceof ast.PathTypeNode) {
    const parts = node.path.parts.map((p) => p.value);

    if (parts.length === 1) {
      const name = parts[0];
      switch (name) {
        case 'Integer':
          return INTEGER_TYPE;
        case 'Double':
          return DOUBLE_TYPE;
        case 'Boolean':
          return BOOLEAN_TYPE;
        case 'String':
          return STRING_TYPE;
        case 'Null':
          return NULL_TYPE;
        case 'Any':
          return ANY_TYPE;
        default: {
          const binding = env.get(name);
          if (binding) {
            return binding.type;
          }
          return new ErrorType(`type not found: ${name}`);
        }
      }
    }

    const moduleName = parts[0];
    const typeName = parts[1];

    const moduleBinding = env.get(moduleName);
    if (!moduleBinding || moduleBinding.type.kind() !== TypeKind.MODULE) {
      return new ErrorType(`module not found: ${moduleName}`);
    }

    const moduleType = moduleBinding.type as ModuleType;
    const typeBinding = moduleType.env.get(typeName);

    if (!typeBinding) {
      return new ErrorType(`type '${typeName}' not found in module '${moduleName}'`);
    }

    if (moduleType.env.exposedNames && !moduleType.env.exposedNames.has(typeName)) {
      return new ErrorType(`type '${typeName}' is not exposed by module '${moduleName}'`);
    }

    return typeBinding.type;
  }

  if (node instanceof ast.GenericTypeNode) {
    const binding = env.get(node.value);
    if (binding && binding.type.kind() === TypeKind.SUM_TYPE) {
      const sumType = binding.type as SumType;
      const typeArguments: LumenType[] = [];
      for (const paramNode of node.typeParameters) {
        const typeArg = typeNodeToLumenType(paramNode, env);
        if (typeArg.kind() === TypeKind.ERROR) return typeArg;
        typeArguments.push(typeArg);
      }
      return instantiateSumType(sumType, typeArguments);
    }

    if (binding && binding.type.kind() === TypeKind.RECORD) {
      const recordType = binding.type as RecordType;
      const typeArguments: LumenType[] = [];
      for (const paramNode of node.typeParameters) {
        const typeArg = typeNodeToLumenType(paramNode, env);
        if (typeArg.kind() === TypeKind.ERROR) return typeArg;
        typeArguments.push(typeArg);
      }
      return instantiateRecordType(recordType, typeArguments);
    }

    if (binding && binding.type.kind() === TypeKind.TRAIT) {
      const traitType = binding.type as TraitType;
      const typeArguments: LumenType[] = [];
      for (const paramNode of node.typeParameters) {
        const typeArg = typeNodeToLumenType(paramNode, env);
        if (typeArg.kind() === TypeKind.ERROR) return typeArg;
        typeArguments.push(typeArg);
      }
      return instantiateTraitType(traitType, typeArguments);
    }

    if (node.value === 'Array') {
      if (node.typeParameters.length !== 1)
        return new ErrorType('Array type expects 1 type parameter');
      const elementType = typeNodeToLumenType(node.typeParameters[0], env);
      if (elementType.kind() === TypeKind.ERROR) return elementType;
      return new ArrayType(elementType);
    }
    if (node.value === 'Hash') {
      if (node.typeParameters.length !== 2)
        return new ErrorType('Hash type expects 2 type parameters');
      const keyType = typeNodeToLumenType(node.typeParameters[0], env);
      if (keyType.kind() === TypeKind.ERROR) return keyType;
      const valueType = typeNodeToLumenType(node.typeParameters[1], env);
      if (valueType.kind() === TypeKind.ERROR) return valueType;
      return new HashType(keyType, valueType);
    }
    return new ErrorType(`unknown generic type: ${node.value}`);
  }

  if (node instanceof ast.FunctionTypeNode) {
    const params: LumenType[] = [];
    for (const p of node.parameters) {
      const paramType = typeNodeToLumenType(p, env);
      if (paramType.kind() === TypeKind.ERROR) return paramType;
      params.push(paramType);
    }
    const returnType = typeNodeToLumenType(node.returnType, env);
    if (returnType.kind() === TypeKind.ERROR) return returnType;
    return new FunctionType(params, returnType);
  }

  if (node instanceof ast.TupleTypeNode) {
    const elementTypes: LumenType[] = [];
    for (const elNode of node.elementTypes) {
      const elType = typeNodeToLumenType(elNode, env);
      if (elType.kind() === TypeKind.ERROR) return elType;
      elementTypes.push(elType);
    }
    return new TupleType(elementTypes);
  }

  return new ErrorType('unknown type node');
}

export function instantiateSumType(genericSumType: SumType, typeArguments: LumenType[]): LumenType {
  if (genericSumType.typeParameters.length !== typeArguments.length) {
    return new ErrorType(
      `incorrect number of type arguments for ${genericSumType.name}: expected ${genericSumType.typeParameters.length}, got ${typeArguments.length}`,
    );
  }

  const substitutions = new Map<string, LumenType>();
  genericSumType.typeParameters.forEach((param, i) => {
    substitutions.set(param.name, typeArguments[i]);
  });

  const newSumType = substitute(genericSumType, substitutions) as SumType;
  newSumType.typeArguments = typeArguments;
  return newSumType;
}

export function instantiateRecordType(
  genericRecordType: RecordType,
  typeArguments: LumenType[],
): LumenType {
  if (genericRecordType.typeParameters.length !== typeArguments.length) {
    return new ErrorType(
      `incorrect number of type arguments for ${genericRecordType.name}: expected ${genericRecordType.typeParameters.length}, got ${typeArguments.length}`,
    );
  }

  const substitutions = new Map<string, LumenType>();
  genericRecordType.typeParameters.forEach((param, i) => {
    substitutions.set(param.name, typeArguments[i]);
  });

  const newFields = new Map<string, LumenType>();
  for (const [fieldName, fieldType] of genericRecordType.fields.entries()) {
    newFields.set(fieldName, substitute(fieldType, substitutions));
  }

  return new RecordType(
    genericRecordType.name,
    newFields,
    genericRecordType.fieldOrder,
    [],
    typeArguments,
  );
}

export function instantiateTraitType(
  genericTraitType: TraitType,
  typeArguments: LumenType[],
): LumenType {
  if (genericTraitType.typeParameters.length !== typeArguments.length) {
    return new ErrorType(
      `incorrect number of type arguments for trait ${genericTraitType.name}: expected ${genericTraitType.typeParameters.length}, got ${typeArguments.length}`,
    );
  }

  const newTraitType = new TraitType(genericTraitType.name, [], typeArguments);
  newTraitType.methods = genericTraitType.methods;
  return newTraitType;
}
