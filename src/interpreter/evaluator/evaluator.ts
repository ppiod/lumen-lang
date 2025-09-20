import * as ast from '@syntax/ast.js';
import {
  LumenInteger,
  LumenDouble,
  LumenBoolean,
  type LumenObject,
  ObjectType,
  LumenReturnValue,
  LumenFunction,
  LumenString,
  LumenArray,
  LumenError,
  LumenBuiltin,
  type Hashable,
  LumenHash,
  type HashPair,
  LumenSumTypeInstance,
  LumenRecord,
  LumenModule,
  LumenTuple,
  NULL,
} from '@runtime/objects.js';
import { Environment } from './environment.js';
import builtins from '@core/globals.js';
import { ModuleLoader } from '../../loader.js';

const TRUE = new LumenBoolean(true);
const FALSE = new LumenBoolean(false);

export function applyFunction(
  fn: LumenObject,
  args: LumenObject[],
  loader: ModuleLoader,
  callNode?: ast.Node,
): LumenObject {
  if (fn instanceof LumenFunction) {
    if (fn.isRecordConstructor) {
      const fields = new Map<string, LumenObject>();
      fn.parameters.forEach((param, idx) => {
        fields.set(param.value, args[idx]);
      });
      return new LumenRecord(fn.recordName!, fields);
    }

    const extendedEnv = new Environment(fn.env);

    if (fn.parameters.length !== args.length) {
      return new LumenError(
        `Function expected ${fn.parameters.length} arguments but got ${args.length}`,
        callNode,
      );
    }

    fn.parameters.forEach((param, paramIdx) => {
      extendedEnv.set(param.value, args[paramIdx], false);
    });

    const evaluated = Eval(fn.body, extendedEnv, loader);

    if (evaluated instanceof LumenReturnValue) {
      return evaluated.value;
    }
    return evaluated;
  }
  if (fn instanceof LumenBuiltin) {
    return fn.fn(loader, ...args);
  }

  if ((fn as any).type() === 'VARIANT_CONSTRUCTOR') {
    const constructor = fn as any;
    return new LumenSumTypeInstance(constructor.typeName, constructor.name, args);
  }

  return new LumenError(`not a function: ${fn.type()}`, callNode);
}

function evalProgram(program: ast.Program, env: Environment, loader: ModuleLoader): LumenObject {
  let result: LumenObject = NULL;
  if (program.statements[0] instanceof ast.ModuleStatement) {
    Eval(program.statements[0], env, loader);
  }

  for (const statement of program.statements) {
    if (statement instanceof ast.ModuleStatement) {
      continue;
    }
    result = Eval(statement, env, loader);
    if (result instanceof LumenReturnValue) return result.value;
    if (result instanceof LumenError) return result;
  }
  return result;
}

function evalBlockStatement(
  block: ast.BlockStatement,
  env: Environment,
  loader: ModuleLoader,
): LumenObject {
  let result: LumenObject = NULL;
  for (const statement of block.statements) {
    result = Eval(statement, env, loader);
    if (result) {
      const rt = result.type();
      if (rt === ObjectType.RETURN_VALUE || rt === ObjectType.ERROR) {
        return result;
      }
    }
  }
  return result;
}

function nativeBoolToBooleanObject(input: boolean): LumenBoolean {
  return input ? TRUE : FALSE;
}

function isTruthy(obj: LumenObject): boolean {
  return obj !== NULL && obj !== FALSE;
}

function evalPrefixExpression(
  operator: string,
  right: LumenObject,
  node: ast.PrefixExpression,
): LumenObject {
  switch (operator) {
    case '!':
      return evalBangOperatorExpression(right);
    case '-':
      return evalMinusPrefixOperatorExpression(right, node);
    default:
      return new LumenError(`unknown operator: ${operator}${right.type()}`, node);
  }
}

function evalBangOperatorExpression(right: LumenObject): LumenObject {
  return nativeBoolToBooleanObject(!isTruthy(right));
}

function evalMinusPrefixOperatorExpression(
  right: LumenObject,
  node: ast.PrefixExpression,
): LumenObject {
  if (right.type() !== ObjectType.INTEGER && right.type() !== ObjectType.DOUBLE) {
    return new LumenError(`unknown operator: -${right.type()}`, node);
  }
  const value = (right as LumenInteger | LumenDouble).value;

  if (right.type() === ObjectType.DOUBLE) {
    return new LumenDouble(-value);
  }
  return new LumenInteger(-value);
}

function evalNumericInfixExpression(
  operator: string,
  leftVal: number,
  rightVal: number,
  node: ast.InfixExpression,
): LumenObject | number {
  switch (operator) {
    case '+':
      return leftVal + rightVal;
    case '-':
      return leftVal - rightVal;
    case '*':
      return leftVal * rightVal;
    case '/':
      if (rightVal === 0) {
        return new LumenError('division by zero', node);
      }
      return leftVal / rightVal;
    case '<':
      return nativeBoolToBooleanObject(leftVal < rightVal);
    case '>':
      return nativeBoolToBooleanObject(leftVal > rightVal);
    case '>=':
      return nativeBoolToBooleanObject(leftVal >= rightVal);
    case '<=':
      return nativeBoolToBooleanObject(leftVal <= rightVal);
    case '==':
      return nativeBoolToBooleanObject(leftVal === rightVal);
    case '!=':
      return nativeBoolToBooleanObject(leftVal !== rightVal);
    default:
      return new LumenError(`unknown operator: ${leftVal} ${operator} ${rightVal}`, node);
  }
}

function evalInfixExpression(
  operator: string,
  left: LumenObject,
  right: LumenObject,
  env: Environment,
  loader: ModuleLoader,
  node: ast.InfixExpression,
): LumenObject {
  const leftType = left.type();
  const rightType = right.type();

  if (
    (leftType === ObjectType.INTEGER || leftType === ObjectType.DOUBLE) &&
    (rightType === ObjectType.INTEGER || rightType === ObjectType.DOUBLE)
  ) {
    const leftVal = (left as LumenInteger | LumenDouble).value;
    const rightVal = (right as LumenInteger | LumenDouble).value;

    if (operator === '%') {
      if (leftType !== ObjectType.INTEGER || rightType !== ObjectType.INTEGER) {
        return new LumenError(
          `operator '%' cannot be applied to types ${leftType} and ${rightType}`,
          node,
        );
      }
      if (rightVal === 0) {
        return new LumenError('modulo by zero', node);
      }
      return new LumenInteger(leftVal % rightVal);
    }

    const result = evalNumericInfixExpression(operator, leftVal, rightVal, node);

    if (result instanceof LumenError || result instanceof LumenBoolean) {
      return result;
    }

    if (leftType === ObjectType.DOUBLE || rightType === ObjectType.DOUBLE) {
      return new LumenDouble(result as number);
    }
    return new LumenInteger(Math.floor(result as number));
  }

  if (leftType === ObjectType.STRING && rightType === ObjectType.STRING) {
    const leftVal = (left as LumenString).value;
    const rightVal = (right as LumenString).value;
    switch (operator) {
      case '+':
        return new LumenString(leftVal + rightVal);
      case '==':
        return nativeBoolToBooleanObject(leftVal === rightVal);
      case '!=':
        return nativeBoolToBooleanObject(leftVal !== rightVal);
      case '<':
        return nativeBoolToBooleanObject(leftVal < rightVal);
      case '<=':
        return nativeBoolToBooleanObject(leftVal <= rightVal);
      case '>':
        return nativeBoolToBooleanObject(leftVal > rightVal);
      case '>=':
        return nativeBoolToBooleanObject(leftVal >= rightVal);
      default:
        return new LumenError(`unknown operator: ${left.type()} ${operator} ${right.type()}`, node);
    }
  }

  if (operator === '==') return nativeBoolToBooleanObject(left === right);
  if (operator === '!=') return nativeBoolToBooleanObject(left !== right);

  if (left.type() !== right.type()) {
    return new LumenError(`type mismatch: ${left.type()} ${operator} ${right.type()}`, node);
  }
  return new LumenError(`unknown operator: ${left.type()} ${operator} ${right.type()}`, node);
}

function evalIfExpression(
  ie: ast.IfExpression,
  env: Environment,
  loader: ModuleLoader,
): LumenObject {
  const condition = Eval(ie.condition, env, loader);
  if (condition instanceof LumenError) return condition;
  if (isTruthy(condition)) {
    return Eval(ie.consequence, env, loader);
  } else if (ie.alternative) {
    return Eval(ie.alternative, env, loader);
  } else {
    return NULL;
  }
}

function evalIdentifier(node: ast.Identifier, env: Environment): LumenObject {
  const val = env.get(node.value);
  if (val) return val;

  const builtin = builtins.get(node.value);
  if (builtin) return builtin;

  const sumTypeName = env.variantToSumType.get(node.value);
  if (sumTypeName) {
    return {
      name: node.value,
      typeName: sumTypeName,
      type: () => 'VARIANT_CONSTRUCTOR',
      inspect: () => `Constructor<${sumTypeName}.${node.value}>`,
    } as any;
  }

  return new LumenError(`identifier not found: ${node.value}`, node);
}

function evalExpressions(
  exps: ast.Expression[],
  env: Environment,
  loader: ModuleLoader,
): LumenObject[] {
  const result: LumenObject[] = [];
  for (const exp of exps) {
    const evaluated = Eval(exp, env, loader);
    if (evaluated instanceof LumenError) return [evaluated];
    result.push(evaluated);
  }
  return result;
}

function evalIndexExpression(
  left: LumenObject,
  index: LumenObject,
  node: ast.IndexExpression,
): LumenObject {
  if (left.type() === ObjectType.ARRAY && index.type() === ObjectType.INTEGER) {
    const arrayObject = left as LumenArray;
    const idx = (index as LumenInteger).value;
    const max = arrayObject.elements.length - 1;
    if (idx < 0 || idx > max) return NULL;
    return arrayObject.elements[idx];
  }
  if (left.type() === ObjectType.HASH) {
    return evalHashIndexExpression(left as LumenHash, index, node);
  }
  if (left.type() === ObjectType.STRING && index.type() === ObjectType.INTEGER) {
    const stringObject = left as LumenString;
    const idx = (index as LumenInteger).value;
    const max = stringObject.value.length - 1;
    if (idx < 0 || idx > max) return NULL;
    return new LumenString(stringObject.value[idx]);
  }
  return new LumenError(`index operator not supported for ${left.type()}`, node);
}

function evalHashLiteral(
  node: ast.HashLiteral,
  env: Environment,
  loader: ModuleLoader,
): LumenObject {
  const pairs = new Map<string, HashPair>();
  for (const [keyNode, valueNode] of node.pairs.entries()) {
    const key = Eval(keyNode, env, loader);
    if (key instanceof LumenError) return key;

    const hashableKey = key as unknown as Hashable;
    if (typeof hashableKey.hashKey !== 'function') {
      return new LumenError(`unusable as hash key: ${key.type()}`, keyNode);
    }

    const value = Eval(valueNode, env, loader);
    if (value instanceof LumenError) return value;

    const hashed = hashableKey.hashKey();
    pairs.set(hashed, { key, value });
  }
  return new LumenHash(pairs);
}

function evalHashIndexExpression(
  hash: LumenHash,
  index: LumenObject,
  node: ast.IndexExpression,
): LumenObject {
  const key = index as unknown as Hashable;
  if (typeof key.hashKey !== 'function') {
    return new LumenError(`unusable as hash key: ${index.type()}`, node.index);
  }
  const pair = hash.pairs.get(key.hashKey());
  
  if (!pair) return new LumenError(`key not found in hash: ${index.inspect()}`, node);
  
  return pair.value;
}

export function Eval(node: ast.Node, env: Environment, loader: ModuleLoader): LumenObject {
  if (node instanceof ast.ModuleStatement) {
    const exposed = new Set(node.exposing.map((ident) => ident.value));
    env.exposedNames = exposed;
    return NULL;
  }
  if (node instanceof ast.UseStatement) {
    const moduleName = node.path.toString();
    const loaded = loader.load(moduleName);
    if (loaded instanceof Error) {
      return new LumenError(loaded.message, node);
    }

    env.mergeImplementations(loaded.evalEnv);

    if (node.alias) {
      const moduleObject = new LumenModule(moduleName, loaded.evalEnv);
      env.set(node.alias.value, moduleObject, false);
    } else if (!node.exposing) {
      const moduleObject = new LumenModule(moduleName, loaded.evalEnv);
      const bindName = node.path.parts[node.path.parts.length - 1].value;
      env.set(bindName, moduleObject, false);
    }

    if (node.exposing) {
      for (const exposed of node.exposing) {
        const name = exposed.value;
        const value = loaded.evalEnv.get(name);

        if (!value) {
          const typeBinding = loaded.typeEnv.get(name);
          if (typeBinding) {
            continue;
          }
          return new LumenError(
            `identifier '${name}' not found in module '${moduleName}'`,
            exposed,
          );
        }

        if (loaded.evalEnv.exposedNames && !loaded.evalEnv.exposedNames.has(name)) {
          return new LumenError(
            `identifier '${name}' is not exposed by module '${moduleName}'`,
            exposed,
          );
        }

        env.set(name, value, false);
      }
    }

    return NULL;
  }
  if (node instanceof ast.Program) return evalProgram(node, env, loader);
  if (node instanceof ast.BlockStatement) return evalBlockStatement(node, env, loader);
  if (node instanceof ast.ExpressionStatement) return Eval(node.expression, env, loader);

  if (node instanceof ast.TypeDeclarationStatement) {
    const typeName = node.name.toString();
    for (const variant of node.variants) {
      env.variantToSumType.set(variant.name.value, typeName);
    }
    return NULL;
  }
  if (node instanceof ast.RecordDeclarationStatement) {
    const name = node.name.value;
    const fieldNames = node.fields.map(
      (f) => new ast.Identifier(f.name.token, f.name.value, f.type),
    );
    const constructor = new LumenFunction(fieldNames, new ast.BlockStatement(node.token), env);
    constructor.isRecordConstructor = true;
    constructor.recordName = name;
    env.set(name, constructor, false);
    return NULL;
  }
  if (node instanceof ast.ImplementationStatement) {
    let targetTypeName = node.targetType.toString();
    if ((node.targetType as any).baseName) {
      targetTypeName = (node.targetType as any).baseName();
    }
    if (node.targetType instanceof ast.GenericTypeNode) {
      targetTypeName = node.targetType.value;
    }
    for (const methodNode of node.methods) {
      const func = new LumenFunction(methodNode.parameters, methodNode.body, env);
      env.addImplementation(targetTypeName, methodNode.name!.value, func);
    }
    return NULL;
  }
  if (node instanceof ast.TraitDeclarationStatement) {
    return NULL;
  }
  if (node instanceof ast.ReturnStatement) {
    const val = Eval(node.returnValue, env, loader);
    if (val instanceof LumenError) return val;
    return new LumenReturnValue(val);
  }
  if (node instanceof ast.LetStatement) {
    const val = Eval(node.value, env, loader);
    if (val instanceof LumenError) return val;

    if (val instanceof LumenReturnValue) {
      return val;
    }

    if (node.name instanceof ast.TuplePattern) {
      if (!(val instanceof LumenTuple)) {
        return new LumenError(
          `cannot destructure non-tuple value of type ${val.type()}`,
          node.value,
        );
      }
      const pattern = node.name as ast.TuplePattern;
      if (pattern.elements.length !== val.elements.length) {
        return new LumenError(
          `destructuring mismatch: pattern wants ${pattern.elements.length} elements, tuple has ${val.elements.length}`,
          node.name,
        );
      }
      pattern.elements.forEach((elem, i) => {
        if (elem instanceof ast.Identifier) {
          env.set(elem.value, val.elements[i], node.isMutable);
        }
      });
      return NULL;
    } else if (node.name instanceof ast.ArrayPattern) {
      if (!(val instanceof LumenArray)) {
        return new LumenError(
          `cannot destructure non-array value of type ${val.type()}`,
          node.value,
        );
      }
      const pattern = node.name as ast.ArrayPattern;

      for (let i = 0; i < pattern.elements.length; i++) {
        const elem = pattern.elements[i];
        const value = val.elements[i] || NULL;
        env.set(elem.value, value, node.isMutable);
      }

      if (pattern.rest) {
        const restElements = val.elements.slice(pattern.elements.length);
        env.set(pattern.rest.value, new LumenArray(restElements), node.isMutable);
      }
      return NULL;
    } else if (node.name instanceof ast.Identifier) {
      env.set(node.name.value, val, node.isMutable);
      return NULL;
    }

    return new LumenError('unsupported pattern in let statement', node.name);
  }
  if (node instanceof ast.Identifier) return evalIdentifier(node, env);
  if (node instanceof ast.IntegerLiteral) return new LumenInteger(node.value);
  if (node instanceof ast.DoubleLiteral) return new LumenDouble(node.value);
  if (node instanceof ast.BooleanLiteral) return nativeBoolToBooleanObject(node.value);
  if (node instanceof ast.StringLiteral) return new LumenString(node.value);
  if (node instanceof ast.InterpolatedStringLiteral) {
    let finalString = '';
    for (const part of node.parts) {
      if (part instanceof ast.StringLiteral) {
        finalString += part.value;
      } else {
        const evaluatedPart = Eval(part, env, loader);
        if (evaluatedPart instanceof LumenError) {
          return evaluatedPart;
        }
        finalString += evaluatedPart.inspect();
      }
    }
    return new LumenString(finalString);
  }
  if (node instanceof ast.TupleLiteral) {
    const elements = evalExpressions(node.elements, env, loader);
    if (elements.length === 1 && elements[0] instanceof LumenError) return elements[0];
    return new LumenTuple(elements);
  }
  if (node instanceof ast.FunctionLiteral) {
    const params = node.parameters;
    const body = node.body;
    return new LumenFunction(params, body, env);
  }
  if (node instanceof ast.PrefixExpression) {
    const right = Eval(node.right, env, loader);
    if (right instanceof LumenError) return right;
    return evalPrefixExpression(node.operator, right, node);
  }
  if (node instanceof ast.InfixExpression) {
    if (node.operator === '=') {
      const right = Eval(node.right, env, loader);
      if (right instanceof LumenError) return right;

      if (node.left instanceof ast.Identifier) {
        const name = node.left.value;
        const binding = env.getBinding(name);
        if (!binding) {
          return new LumenError(`cannot assign to undeclared variable '${name}'`, node.left);
        }
        if (!binding.isMutable) {
          return new LumenError(`cannot assign to immutable variable '${name}'`, node.left);
        }
        return env.set(name, right, true);
      }

      if (node.left instanceof ast.IndexExpression) {
        const indexExpr = node.left;
        const collection = Eval(indexExpr.left, env, loader);
        if (collection instanceof LumenError) return collection;

        const index = Eval(indexExpr.index, env, loader);
        if (index instanceof LumenError) return index;

        if (collection instanceof LumenHash) {
          if (!('hashKey' in index && typeof (index as any).hashKey === 'function')) {
            return new LumenError(`unusable as hash key: ${index.type()}`, indexExpr.index);
          }
          const hashableKey = index as Hashable;
          collection.pairs.set(hashableKey.hashKey(), {
            key: index,
            value: right,
          });
          return right;
        }
        return new LumenError(
          `assignment not supported for type ${collection.type()}`,
          indexExpr.left,
        );
      }
      return new LumenError('invalid assignment target', node.left);
    } else if (node.operator === '+=') {
      if (!(node.left instanceof ast.Identifier)) {
        return new LumenError('invalid assignment target', node.left);
      }
      const name = node.left.value;
      const binding = env.getBinding(name);
      if (!binding) {
        return new LumenError(`cannot assign to undeclared variable '${name}'`, node.left);
      }
      if (!binding.isMutable) {
        return new LumenError(`cannot assign to immutable variable '${name}'`, node.left);
      }

      const right = Eval(node.right, env, loader);
      if (right instanceof LumenError) return right;

      const leftVal = (binding.value as LumenInteger | LumenDouble).value;
      const rightVal = (right as LumenInteger | LumenDouble).value;
      const sum = leftVal + rightVal;

      if (binding.value.type() === ObjectType.DOUBLE || right.type() === ObjectType.DOUBLE) {
        return env.set(name, new LumenDouble(sum), true);
      }
      return env.set(name, new LumenInteger(sum), true);
    }

    if (node.operator === '&&') {
      const left = Eval(node.left, env, loader);
      if (left instanceof LumenError) return left;
      if (!isTruthy(left)) {
        return left;
      }
      return Eval(node.right, env, loader);
    }

    if (node.operator === '||') {
      const left = Eval(node.left, env, loader);
      if (left instanceof LumenError) return left;
      if (isTruthy(left)) {
        return left;
      }
      return Eval(node.right, env, loader);
    }

    const left = Eval(node.left, env, loader);
    if (left instanceof LumenError) return left;
    const right = Eval(node.right, env, loader);
    if (right instanceof LumenError) return right;
    return evalInfixExpression(node.operator, left, right, env, loader, node);
  }
  if (node instanceof ast.IfExpression) return evalIfExpression(node, env, loader);
  if (node instanceof ast.ArrayLiteral) {
    const elements = evalExpressions(node.elements, env, loader);
    if (elements.length === 1 && elements[0] instanceof LumenError) return elements[0];
    return new LumenArray(elements);
  }
  if (node instanceof ast.HashLiteral) {
    return evalHashLiteral(node, env, loader);
  }
  if (node instanceof ast.IndexExpression) {
    const left = Eval(node.left, env, loader);
    if (left instanceof LumenError) return left;
    const index = Eval(node.index, env, loader);
    if (index instanceof LumenError) return index;
    return evalIndexExpression(left, index, node);
  }
  if (node instanceof ast.MemberAccessExpression) {
    const object = Eval(node.object, env, loader);
    if (object.type() === ObjectType.ERROR) return object;
    const propertyName = node.property.value;

    if (object.type() === ObjectType.MODULE) {
      const moduleObject = object as LumenModule;
      const value = moduleObject.env.get(propertyName);
      if (!value) {
        return new LumenError(
          `identifier '${propertyName}' not found in module '${moduleObject.name}'`,
          node.property,
        );
      }
      if (moduleObject.env.exposedNames && !moduleObject.env.exposedNames.has(propertyName)) {
        return new LumenError(
          `identifier '${propertyName}' is not exposed by module '${moduleObject.name}'`,
          node.property,
        );
      }
      return value;
    }

    if (object.type() === ObjectType.RECORD) {
      const recordInstance = object as LumenRecord;
      const value = recordInstance.fields.get(propertyName);
      if (value) {
        return value;
      }
    }

    if (object.type() === ObjectType.HASH) {
      const hash = object as LumenHash;
      const key = new LumenString(propertyName);
      const pair = hash.pairs.get(key.hashKey());

      if (!pair) {
        return new LumenError(
          `hash does not have property '${propertyName}'`,
          node.property
        );
      }
      return pair.value;
    }

    let typeName = object.type().toString();
    if (object instanceof LumenRecord) {
      typeName = object.name;
    }
    if (object instanceof LumenSumTypeInstance) {
      typeName = object.typeName;
    }
    if (object instanceof LumenHash) {
      typeName = 'Hash';
    }

    const method = env.getMethod(typeName, propertyName);

    if (method) {
      const boundMethod = new LumenFunction(method.parameters, method.body, method.env);
      boundMethod.selfContext = object;
      return boundMethod;
    }

    return new LumenError(
      `no field or method '${propertyName}' found for type '${typeName}'`,
      node.property,
    );
  }
  if (node instanceof ast.CallExpression) {
    const func = Eval(node.func, env, loader);
    if (func instanceof LumenError) return func;
    const args = evalExpressions(node.args, env, loader);
    if (args.length === 1 && args[0] instanceof LumenError) return args[0];

    if (func instanceof LumenFunction && func.selfContext) {
      return applyFunction(func, [func.selfContext, ...args], loader, node);
    }

    return applyFunction(func, args, loader, node);
  }

  if (node instanceof ast.TryExpression) {
    const left = Eval(node.left, env, loader);
    if (left instanceof LumenError) return left;

    if (!(left instanceof LumenSumTypeInstance) || left.typeName !== 'Result') {
      return new LumenError(
        `operator '?' can only be used on a Result value, but got ${left.type()}`,
        node.left,
      );
    }

    if (left.variantName === 'Err') {
      return new LumenReturnValue(left);
    }

    return left.values[0];
  }

  if (node instanceof ast.MatchExpression) {
    return evalMatchExpression(node, env, loader);
  }

  if (node instanceof ast.WhenExpression) {
    return evalWhenExpression(node, env, loader);
  }

  return NULL;
}

function evalWhenExpression(
  node: ast.WhenExpression,
  env: Environment,
  loader: ModuleLoader,
): LumenObject {
  if (node.subject) {
    const subject = Eval(node.subject, env, loader);
    if (subject instanceof LumenError) return subject;

    for (const branch of node.branches) {
      for (const patternNode of branch.patterns) {
        const patternValue = Eval(patternNode, env, loader);
        if (patternValue instanceof LumenError) return patternValue;

        let branchMatches = false;

        if (patternValue instanceof LumenBoolean) {
          if (patternValue.value) {
            branchMatches = true;
          }
        } else {
          const comparison = evalInfixExpression(
            '==',
            subject,
            patternValue,
            env,
            loader,
            new ast.InfixExpression(patternNode.token, node.subject, '==', patternNode),
          );
          if (comparison instanceof LumenBoolean && comparison.value) {
            branchMatches = true;
          }
        }

        if (branchMatches) {
          return Eval(branch.body, env, loader);
        }
      }
    }
  } else {
    for (const branch of node.branches) {
      const condition = Eval(branch.patterns[0], env, loader);
      if (condition instanceof LumenError) return condition;
      if (isTruthy(condition)) {
        return Eval(branch.body, env, loader);
      }
    }
  }

  return Eval(node.elseBody, env, loader);
}

function evalMatchExpression(
  node: ast.MatchExpression,
  env: Environment,
  loader: ModuleLoader,
): LumenObject {
  if (node.values.length !== 1) {
    return new LumenError(`match on tuples is not yet supported by the evaluator`, node);
  }
  const value = Eval(node.values[0], env, loader);
  if (value instanceof LumenError) return value;

  for (const arm of node.arms) {
    let isMatch = false;
    const armEnv = new Environment(env);

    if (arm.pattern instanceof ast.WildcardPattern) {
      isMatch = true;
    } else if (arm.pattern instanceof ast.VariantPattern && value instanceof LumenSumTypeInstance) {
      const pattern = arm.pattern;
      if (
        value.variantName === pattern.path.value &&
        value.values.length === pattern.parameters.length
      ) {
        isMatch = true;
        pattern.parameters.forEach((param, i) => {
          armEnv.set(param.value, value.values[i], true);
        });
      }
    } else if (arm.pattern instanceof ast.ArrayPattern && value instanceof LumenArray) {
      const pattern = arm.pattern;
      const array = value;

      if (!pattern.rest && pattern.elements.length === array.elements.length) {
        isMatch = true;
        pattern.elements.forEach((param, i) => {
          armEnv.set(param.value, array.elements[i], true);
        });
      } else if (pattern.rest && pattern.elements.length <= array.elements.length) {
        isMatch = true;
        pattern.elements.forEach((param, i) => {
          armEnv.set(param.value, array.elements[i], true);
        });
        const restElements = array.elements.slice(pattern.elements.length);
        armEnv.set(pattern.rest.value, new LumenArray(restElements), true);
      }
    } else if (arm.pattern instanceof ast.Identifier) {
      isMatch = true;
      armEnv.set(arm.pattern.value, value, true);
    } else {
      const patternValue = Eval(arm.pattern, env, loader);
      if (patternValue instanceof LumenError) return patternValue;

      const comparison = evalInfixExpression(
        '==',
        value,
        patternValue,
        env,
        loader,
        new ast.InfixExpression(arm.pattern.token, node.values[0], '==', arm.pattern as ast.Expression),
      );

      if (comparison instanceof LumenBoolean && comparison.value) {
        isMatch = true;
      }
    }

    if (isMatch) {
      return Eval(arm.body, armEnv, loader);
    }
  }

  return new LumenError(`no pattern in match expression matched value: ${value.inspect()}`, node);
}