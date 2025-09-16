import { Database as BunDatabase, Statement as BunStatement } from 'bun:sqlite';
import { type LumenObject, ObjectType } from '@runtime/objects.js';

export class LumenSQLiteDB implements LumenObject {
  constructor(public db: BunDatabase) {}

  public type(): ObjectType {
    return ObjectType.RECORD;
  }

  public inspect(): string {
    return `<SQLite Database>`;
  }
}

export class LumenSQLiteStatement implements LumenObject {
  constructor(public stmt: BunStatement) {}

  public type(): ObjectType {
    return ObjectType.RECORD;
  }

  public inspect(): string {
    return `<SQLite Statement: ${this.stmt.toString()}>`;
  }
}
