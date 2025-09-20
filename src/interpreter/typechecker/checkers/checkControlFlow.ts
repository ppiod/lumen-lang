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

  for (const arm of node.arms) {
    const armEnv = new TypeEnvironment(env);
    let armProcessed = false;

    if (arm.pattern instanceof ast.WildcardPattern) {
      armProcessed = true;
    } else if (arm.pattern instanceof ast.VariantPattern) {
      const pattern = arm.pattern;
      const caseName = pattern.path.value;
      const activePatternType = env.getActivePatternType(caseName);

      if (activePatternType) {
        armProcessed = true;
        const inputParamType = activePatternType.parameters[0];
        if (!unify(inputParamType, valueType, new Map())) {
          return new ErrorType(
            `Pattern ${caseName} expects an input of type ${inputParamType.toString()}, but is matching on a value of type ${valueType.toString()}`,
            valueNode,
          );
        }

        const returnSumType = activePatternType.returnType as SumType;
        const variantType = returnSumType.variants.get(caseName);

        if (!variantType) {
          return new ErrorType(
            `The function for active pattern '${caseName}' returns type '${returnSumType.toString()}', which does not have a variant named '${caseName}'`,
            pattern,
          );
        }

        if (variantType.parameters.length !== pattern.parameters.length) {
          return new ErrorType(
            `Pattern case '${caseName}' expects ${variantType.parameters.length} arguments, but pattern provides ${pattern.parameters.length}`,
            pattern,
          );
        }

        pattern.parameters.forEach((param, i) => {
          armEnv.set(param.value, variantType.parameters[i], false);
        });
      }
    }

    if (!armProcessed && valueType.kind() === TypeKind.SUM_TYPE) {
      const sumType = valueType as SumType;
      const sumTypeBinding = env.get(sumType.name);
      if (!sumTypeBinding || sumTypeBinding.type.kind() !== TypeKind.SUM_TYPE) {
        return new ErrorType(`Could not find definition for type ${sumType.name}`, valueNode);
      }
      const sumTypeDef = sumTypeBinding.type as SumType;

      if (arm.pattern instanceof ast.VariantPattern) {
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
        pattern.parameters.forEach((param, i) => {
          const paramType = variantType.parameters[i];
          armEnv.set(param.value, paramType, false);
        });
      }
    } else if (!armProcessed && valueType.kind() === TypeKind.ARRAY) {
      const arrayType = valueType as ArrayType;
      const elementType = arrayType.elementType;
      if (arm.pattern instanceof ast.ArrayPattern) {
        const pattern = arm.pattern;
        pattern.elements.forEach((el) => {
          armEnv.set(el.value, elementType, false);
        });
        if (pattern.rest) {
          armEnv.set(pattern.rest.value, arrayType, false);
        }
      } else if (arm.pattern instanceof ast.Identifier) {
        const pattern = arm.pattern;
        armEnv.set(pattern.value, arrayType, false);
      } else if (!(arm.pattern instanceof ast.WildcardPattern)) {
        return new ErrorType(
          `invalid pattern for Array type: ${arm.pattern.toString()}`,
          arm.pattern,
        );
      }
    } else if (!armProcessed && (valueType.kind() === TypeKind.STRING ||
      valueType.kind() === TypeKind.INTEGER ||
      valueType.kind() === TypeKind.DOUBLE ||
      valueType.kind() === TypeKind.BOOLEAN)) {
      if (!(arm.pattern instanceof ast.WildcardPattern)) {
        const patternType = check(arm.pattern, armEnv, loader, valueType);
        if (patternType.kind() === TypeKind.ERROR) return patternType;
        if (!isSameType(valueType, patternType)) {
          return new ErrorType(
            `This pattern has type ${patternType.toString()}, but the match is on a value of type ${valueType.toString()}.`,
            arm.pattern,
          );
        }
      }
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

  if (valueType.kind() === TypeKind.SUM_TYPE) {
    const sumType = valueType as SumType;
    const coveredVariants = new Set<string>();
    let hasWildcard = false;
    for (const arm of node.arms) {
      if (arm.pattern instanceof ast.WildcardPattern) {
        hasWildcard = true;
        break;
      }
      if (arm.pattern instanceof ast.VariantPattern) {
        coveredVariants.add(arm.pattern.path.value);
      }
    }
    const sumTypeBinding = env.get(sumType.name);
    if (sumTypeBinding && sumTypeBinding.type.kind() === TypeKind.SUM_TYPE) {
        const sumTypeDef = sumTypeBinding.type as SumType;
        const allVariants = new Set(sumTypeDef.variants.keys());
        if (!hasWildcard && coveredVariants.size < allVariants.size) {
            const missing = [...allVariants].filter((v) => !coveredVariants.has(v));
            return new ErrorType(
                `match is not exhaustive. Missing patterns: ${missing.join(', ')}`,
                node,
            );
        }
    }
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
