import * as ast from '@syntax/ast.js';
import {
  type LumenType,
  TypeKind,
  ErrorType,
  FunctionType,
  SumType,
  VariantType,
  TypeVariable,
  RecordType,
  TraitType,
  TraitMethodType,
  NULL_TYPE,
} from '@syntax/type.js';
import { TypeEnvironment } from '../environment.js';
import { ModuleLoader } from '../../../loader.js';
import { checkFunctionLiteral } from './checkExpressions.js';
import { substitute, typeNodeToLumenType, unify } from '../utils.js';

export function checkRecordDeclaration(
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

export function checkTraitDeclaration(
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

export function checkImplementationStatement(
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
  env.addImplementation(baseTypeName, node, implEnv);

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

export function checkTypeDeclaration(
  node: ast.TypeDeclarationStatement,
  env: TypeEnvironment,
): LumenType {
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
