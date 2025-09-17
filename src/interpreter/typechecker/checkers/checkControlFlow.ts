import * as ast from '@syntax/ast.js';
import {
  type LumenType,
  TypeKind,
  ErrorType,
  BOOLEAN_TYPE,
  NULL_TYPE,
  ArrayType,
  SumType,
  DOUBLE_TYPE,
  VariantType,
} from '@syntax/type.js';
import { TypeEnvironment } from '../environment.js';
import { ModuleLoader } from '../../../loader.js';
import { check } from '../typechecker.js';
import { isSameType, substitute, unify } from '../utils.js';

export function checkIfExpression(
  node: ast.IfExpression,
  env: TypeEnvironment,
  loader: ModuleLoader,
  expectedType?: LumenType,
): LumenType {
  const conditionType = check(node.condition, env, loader, BOOLEAN_TYPE);
  if (conditionType.kind() === TypeKind.ERROR) return conditionType;
  if (!isSameType(conditionType, BOOLEAN_TYPE))
    return new ErrorType(
      `condition of if-expression must be a Boolean, but got ${conditionType.toString()}`,
      node.condition,
    );

  if (!node.alternative) {
    check(node.consequence, env, loader);
    return NULL_TYPE;
  }

  const consequenceType = check(node.consequence, env, loader, expectedType);
  if (consequenceType.kind() === TypeKind.ERROR) return consequenceType;

  const alternativeType = check(node.alternative, env, loader, expectedType);
  if (alternativeType.kind() === TypeKind.ERROR) return alternativeType;

  if (!isSameType(consequenceType, alternativeType))
    return new ErrorType(
      `branches of if-expression must have the same type, but got ${consequenceType.toString()} and ${alternativeType.toString()}`,
      node,
    );

  return consequenceType;
}

export function checkMatchExpression(
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

export function checkWhenExpression(
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

    const substitutions = new Map<string, LumenType>();
    if (unify(commonBranchType, bodyType, substitutions)) {
      commonBranchType = substitute(commonBranchType, substitutions);
      return undefined;
    }

    if (isSameType(commonBranchType, bodyType)) {
      if (bodyType.kind() === TypeKind.DOUBLE) {
        commonBranchType = DOUBLE_TYPE;
      }
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
          if (patternType.kind() !== TypeKind.NULL && !unify(subjectType, patternType, new Map())) {
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
      for (const pattern of branch.patterns) {
        const conditionType = check(pattern, env, loader, BOOLEAN_TYPE);
        if (conditionType.kind() === TypeKind.ERROR) return conditionType;
        if (!isSameType(conditionType, BOOLEAN_TYPE)) {
          return new ErrorType(
            `when branch condition must be a Boolean, but got ${conditionType.toString()}`,
            pattern,
          );
        }
      }
      const error = processBranch(branch.body);
      if (error) return error;
    }
  }

  const elseError = processBranch(node.elseBody);
  if (elseError) return elseError;

  return commonBranchType || NULL_TYPE;
}
