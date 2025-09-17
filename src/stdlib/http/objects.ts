import {
  LumenHash,
  LumenInteger,
  type LumenObject,
  LumenRecord,
  LumenString,
  type HashPair,
} from '@runtime/objects.js';
import { FastifyRequest } from 'fastify';

export function createRequestObject(request: FastifyRequest): LumenRecord {
  const headersPairs = new Map<string, HashPair>();
  for (const key in request.headers) {
    const value = request.headers[key];
    if (typeof value === 'string') {
      const lumenKey = new LumenString(key);
      const lumenValue = new LumenString(value);
      headersPairs.set(lumenKey.hashKey(), { key: lumenKey, value: lumenValue });
    }
  }

  const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

  const fields = new Map<string, LumenObject>([
    ['method', new LumenString(request.method)],
    ['url', new LumenString(request.url)],
    ['headers', new LumenHash(headersPairs)],
    ['body', new LumenString(body || '')],
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
