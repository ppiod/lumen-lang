import { LumenHash, LumenInteger, type LumenObject, LumenRecord, LumenString, type HashPair } from '@runtime/objects.js';
import type http from 'http';

export function createRequestObject(req: http.IncomingMessage, body: string): LumenRecord {
  const headersPairs = new Map<string, HashPair>();
  for (const key in req.headers) {
    const value = req.headers[key];
    if (typeof value === 'string') {
      const lumenKey = new LumenString(key);
      const lumenValue = new LumenString(value);
      headersPairs.set(lumenKey.hashKey(), { key: lumenKey, value: lumenValue });
    }
  }

  const fields = new Map<string, LumenObject>([
    ['method', new LumenString(req.method || 'GET')],
    ['url', new LumenString(req.url || '/')],
    ['headers', new LumenHash(headersPairs)],
    ['body', new LumenString(body)],
  ]);
  return new LumenRecord('Request', fields);
}

export function createResponseConstructor(): LumenRecord {
  const fields = new Map<string, LumenObject>([
    ['status', new LumenInteger(200)],
    ['body', new LumenString('')],
  ]);
  return new LumenRecord('Response', fields);
}