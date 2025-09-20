import type { LumenObject, LumenFunction } from '@runtime/objects.js';

interface ValueBinding {
  value: LumenObject;
  isMutable: boolean;
}

export class Environment {
  private store: Map<string, ValueBinding>;
  public variantToSumType: Map<string, string>;
  private implementations: Map<string, Map<string, LumenFunction>>;
  private activePatterns: Map<string, LumenFunction>;
  private outer: Environment | null;
  public exposedNames: Set<string> | undefined = undefined;

  constructor(outer: Environment | null = null) {
    this.store = new Map();
    this.variantToSumType = outer ? outer.variantToSumType : new Map();
    this.implementations = outer ? outer.implementations : new Map();
    this.activePatterns = outer ? outer.activePatterns : new Map();
    this.outer = outer;

    if (!outer) {
      this.variantToSumType.set('Ok', 'Result');
      this.variantToSumType.set('Err', 'Result');
      this.variantToSumType.set('Some', 'Option');
      this.variantToSumType.set('None', 'Option');
    }
  }

  public mergeImplementations(otherEnv: Environment): void {
    for (const [typeName, methodsToAdd] of otherEnv.implementations.entries()) {
      if (!this.implementations.has(typeName)) {
        this.implementations.set(typeName, new Map());
      }
      const existingMethods = this.implementations.get(typeName)!;
      for (const [methodName, func] of methodsToAdd.entries()) {
        if (!existingMethods.has(methodName)) {
          existingMethods.set(methodName, func);
        }
      }
    }
  }

  public get(name: string): LumenObject | undefined {
    const binding = this.getBinding(name);
    return binding ? binding.value : undefined;
  }

  public getBinding(name: string): ValueBinding | undefined {
    let binding = this.store.get(name);
    if (!binding && this.outer) {
      binding = this.outer.getBinding(name);
    }
    return binding;
  }

  public set(name: string, val: LumenObject, isMutable: boolean = false): LumenObject {
    if (this.store.has(name)) {
      const existingBinding = this.store.get(name)!;
      if (!existingBinding.isMutable) {
        return val;
      }
      this.store.set(name, { ...existingBinding, value: val });
      return val;
    }

    let parentEnv = this.outer;
    while (parentEnv) {
      if (parentEnv.store.has(name)) {
        const existingBinding = parentEnv.store.get(name)!;
        if (!existingBinding.isMutable) {
          return val;
        }
        parentEnv.store.set(name, { ...existingBinding, value: val });
        return val;
      }
      parentEnv = parentEnv.outer;
    }

    this.store.set(name, { value: val, isMutable });
    return val;
  }

  public addImplementation(typeName: string, methodName: string, func: LumenFunction): void {
    if (!this.implementations.has(typeName)) {
      this.implementations.set(typeName, new Map());
    }
    this.implementations.get(typeName)!.set(methodName, func);
  }

  public getMethod(typeName: string, methodName: string): LumenFunction | undefined {
    const methods = this.implementations.get(typeName);
    if (methods && methods.has(methodName)) {
      return methods.get(methodName);
    }
    if (this.outer) {
      return this.outer.getMethod(typeName, methodName);
    }
    return undefined;
  }

  public setActivePattern(caseName: string, func: LumenFunction): void {
    this.activePatterns.set(caseName, func);
  }

  public getActivePattern(caseName: string): LumenFunction | undefined {
    const pattern = this.activePatterns.get(caseName);
    if (pattern) {
      return pattern;
    }
    if (this.outer) {
      return this.outer.getActivePattern(caseName);
    }
    return undefined;
  }
}
