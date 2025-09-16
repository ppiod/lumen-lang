import fs from 'fs';
import path from 'path';
import { Lexer } from '@interpreter/lexer.js';
import { Parser } from '@interpreter/parser.js';
import { TypeEnvironment } from '@interpreter/typechecker/environment.js';
import { Environment } from '@interpreter/evaluator/environment.js';
import { check } from '@interpreter/typechecker/typechecker.js';
import { builtinTypes, builtinConstructors } from '@core/types.js';
import { ErrorType, TypeKind } from '@syntax/type.js';
import { stdlib } from '@stdlib/index.js';
import type { Program } from '@syntax/ast.js';
import { Eval } from '@interpreter/evaluator/evaluator.js';
import { LumenError } from '@runtime/objects.js';

export class LumenErrorWithSource extends Error {
  constructor(
    public originalError: LumenError | ErrorType,
    public sourceCode: string,
    public filePath: string,
  ) {
    super(originalError.message);
  }
}

export interface LoadedModule {
  program: Program | null;
  typeEnv: TypeEnvironment;
  evalEnv: Environment;
}

export class ModuleLoader {
  private cache: Map<string, LoadedModule> = new Map();
  private baseDir: string;
  private loadingStack: string[] = [];

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  public resolvePath(moduleName: string): string {
    const parts = moduleName.split('.');
    const filePath = path.join(...parts) + '.lu';
    return path.resolve(this.baseDir, filePath);
  }

  public load(moduleName: string): LoadedModule | Error {
    if (this.cache.has(moduleName)) {
      return this.cache.get(moduleName)!;
    }

    if (this.loadingStack.includes(moduleName)) {
      const cyclePath = [...this.loadingStack, moduleName].join(' -> ');
      return new Error(`Circular dependency detected: ${cyclePath}`);
    }

    this.loadingStack.push(moduleName);

    try {
      if (stdlib.has(moduleName)) {
        return this.loadNativeModule(moduleName);
      }
      return this.loadUserModule(moduleName);
    } finally {
      this.loadingStack.pop();
    }
  }

  private loadNativeModule(moduleName: string): LoadedModule {
    const nativeModule = stdlib.get(moduleName)!;
    const typeEnv = new TypeEnvironment();
    for (const [name, type] of nativeModule.types.entries()) {
      typeEnv.set(name, type, false);
    }
    if (nativeModule.constructors) {
      for (const [name, ctor] of nativeModule.constructors.entries()) {
        typeEnv.constructors.set(name, ctor.type);
      }
    }

    const evalEnv = new Environment();
    for (const [name, value] of nativeModule.values.entries()) {
      evalEnv.set(name, value, false);
    }
    if (nativeModule.constructors) {
      for (const [name, ctor] of nativeModule.constructors.entries()) {
        evalEnv.set(name, ctor.value, false);
      }
    }

    const allExposedNames = new Set([
      ...nativeModule.types.keys(),
      ...nativeModule.values.keys(),
      ...(nativeModule.constructors?.keys() || []),
    ]);
    typeEnv.exposedNames = allExposedNames;
    evalEnv.exposedNames = allExposedNames;

    const loadedModule: LoadedModule = { program: null, typeEnv, evalEnv };
    this.cache.set(moduleName, loadedModule);
    return loadedModule;
  }

  private loadUserModule(moduleName: string): LoadedModule | Error {
    const filePath = this.resolvePath(moduleName);
    let input: string;

    try {
      input = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return new Error(`Error: Could not read module file: ${filePath}`);
    }

    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.parseProgram();

    if (parser.errors.length > 0) {
      return new Error(`Parsing errors in module ${moduleName}:\n${parser.errors.join('\n')}`);
    }

    const typeEnv = new TypeEnvironment();
    for (const [name, type] of builtinTypes.entries()) {
      typeEnv.set(name, type, false);
    }
    for (const [name, type] of builtinConstructors.entries()) {
      typeEnv.constructors.set(name, type);
    }

    const typeResult = check(program, typeEnv, this);
    if (typeResult.kind() === TypeKind.ERROR) {
      return new LumenErrorWithSource(typeResult as ErrorType, input, filePath);
    }

    const evalEnv = new Environment();
    evalEnv.variantToSumType.set('Ok', 'Result');
    evalEnv.variantToSumType.set('Err', 'Result');

    const loadedModule: LoadedModule = { program, typeEnv, evalEnv };
    this.cache.set(moduleName, loadedModule);

    const evalResult = Eval(program, evalEnv, this);

    if (evalResult instanceof LumenError) {
      this.cache.delete(moduleName);
      return new LumenErrorWithSource(evalResult, input, filePath);
    }

    return loadedModule;
  }
}
