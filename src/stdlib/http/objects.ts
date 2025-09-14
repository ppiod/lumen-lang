import { LumenInteger, type LumenObject, LumenRecord, LumenString } from '@runtime/objects.js';
import type http from 'http';

export function createRequestObject(req: http.IncomingMessage, body: string): LumenRecord {
  const fields = new Map<string, LumenObject>([
    ['method', new LumenString(req.method || 'GET')],
    ['url', new LumenString(req.url || '/')],
    ['headers', new LumenString(JSON.stringify(req.headers))],
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
