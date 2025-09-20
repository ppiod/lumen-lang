import * as ast from '@syntax/ast.js';
import {
  type LumenType,
  TypeKind,
  ErrorType,
  INTEGER_TYPE,
  DOUBLE_TYPE,
  BOOLEAN_TYPE,
  STRING_TYPE,
  NULL_TYPE,
} from '@syntax/type.js';
import { TypeEnvironment } from './environment.js';
import { ModuleLoader } from '../../loader.js';
import {
  checkImplementationStatement,
  checkRecordDeclaration,
  checkTraitDeclaration,
  checkTypeDeclaration,
} from './checkers/checkDeclarations.js';
import {
  checkLetStatement,
  checkModuleStatement,
  checkUseStatement,
} from './checkers/checkStatements.js';
import {
  checkArrayLiteral,
  checkCallExpression,
  checkFunctionLiteral,
  checkHashLiteral,
  checkIndexExpression,
  checkInfixExpression,
  checkMemberAccessExpression,
  checkPrefixExpression,
  checkTryExpression,
  checkTupleLiteral,
} from './checkers/checkExpressions.js';
import {
  checkIfExpression,
  checkMatchExpression,
  checkWhenExpression,
} from './checkers/checkControlFlow.js';

export { typeNodeToLumenType, unify } from './utils.js';

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

  if (node instanceof ast.ModuleStatement) return checkModuleStatement(node, env);
  if (node instanceof ast.UseStatement) return checkUseStatement(node, env, loader);
  if (node instanceof ast.TypeDeclarationStatement) return checkTypeDeclaration(node, env);
  if (node instanceof ast.RecordDeclarationStatement) return checkRecordDeclaration(node, env);
  if (node instanceof ast.TraitDeclarationStatement) return checkTraitDeclaration(node, env);
  if (node instanceof ast.ImplementationStatement)
    return checkImplementationStatement(node, env, loader);
  if (node instanceof ast.LetStatement) return checkLetStatement(node, env, loader);

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
  if (node instanceof ast.TupleLiteral) return checkTupleLiteral(node, env, loader, expectedType);

  if (node instanceof ast.InterpolatedStringLiteral) {
    for (const part of node.parts) {
      if (!(part instanceof ast.StringLiteral)) {
        const partType = check(part, env, loader);
        if (partType.kind() === TypeKind.ERROR) {
          return partType;
        }
      }
    }
    return STRING_TYPE;
  }

  if (node instanceof ast.FunctionLiteral)
    return checkFunctionLiteral(node, env, loader, undefined, expectedType);
  if (node instanceof ast.ArrayLiteral) return checkArrayLiteral(node, env, loader, expectedType);
  if (node instanceof ast.HashLiteral) return checkHashLiteral(node, env, loader, expectedType);

  if (node instanceof ast.Identifier) {
    const constructor = env.constructors.get(node.value);
    if (constructor) {
      return constructor;
    }
    const binding = env.get(node.value);
    if (!binding) return new ErrorType(`identifier not found: ${node.value}`, node);
    return binding.type;
  }

  if (node instanceof ast.PrefixExpression) return checkPrefixExpression(node, env, loader);
  if (node instanceof ast.InfixExpression) return checkInfixExpression(node, env, loader);
  if (node instanceof ast.IndexExpression) return checkIndexExpression(node, env, loader);
  if (node instanceof ast.MemberAccessExpression)
    return checkMemberAccessExpression(node, env, loader);
  if (node instanceof ast.CallExpression)
    return checkCallExpression(node, env, loader, expectedType);
  if (node instanceof ast.TryExpression) return checkTryExpression(node, env, loader);

  if (node instanceof ast.IfExpression) return checkIfExpression(node, env, loader, expectedType);
  if (node instanceof ast.MatchExpression)
    return checkMatchExpression(node, env, loader, expectedType);
  if (node instanceof ast.WhenExpression) return checkWhenExpression(node, env, loader);

  return new ErrorType(`type checking not implemented for ${node.constructor.name}`, node);
}
