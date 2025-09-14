import http from 'http';
import { applyFunction } from '@interpreter/evaluator/evaluator.js';
import type { ModuleLoader } from '../../loader.js';
import {
  LumenBuiltin,
  LumenError,
  LumenFunction,
  LumenHash,
  LumenInteger,
  type LumenObject,
  LumenRecord,
  LumenString,
  NULL,
  type HashPair,
} from '@runtime/objects.js';
import { createRequestObject } from './objects.js';
import { httpTypes } from './types.js';
import { FunctionType } from '@syntax/type.js';
import type { NativeModule } from '@stdlib/index.js';
import { stringifyRecursive } from '@stdlib/json/index.js';

interface TrieNode {
  children: Map<string, TrieNode>;
  handlers: Map<string, LumenFunction>;
  paramName: string | null;
}

function createTrieNode(): TrieNode {
  return {
    children: new Map(),
    handlers: new Map(),
    paramName: null,
  };
}

class Router {
  private root = createTrieNode();

  public addRoute(method: string, path: string, handler: LumenFunction) {
    let currentNode = this.root;
    const parts = path.split('/').filter((p) => p.length > 0);

    for (const part of parts) {
      if (part.startsWith(':')) {
        const paramName = part.substring(1);
        if (!currentNode.children.has(':param')) {
          currentNode.children.set(':param', createTrieNode());
        }
        currentNode = currentNode.children.get(':param')!;
        currentNode.paramName = paramName;
      } else {
        if (!currentNode.children.has(part)) {
          currentNode.children.set(part, createTrieNode());
        }
        currentNode = currentNode.children.get(part)!;
      }
    }
    currentNode.handlers.set(method, handler);
  }

  public findRoute(
    method: string,
    path: string,
  ): { handler: LumenFunction | undefined; params: Map<string, string> } {
    let currentNode = this.root;
    const params = new Map<string, string>();
    const parts = path.split('/').filter((p) => p.length > 0);

    for (const part of parts) {
      if (currentNode.children.has(part)) {
        currentNode = currentNode.children.get(part)!;
      } else if (currentNode.children.has(':param')) {
        currentNode = currentNode.children.get(':param')!;
        if (currentNode.paramName) {
          params.set(currentNode.paramName, part);
        }
      } else {
        return { handler: undefined, params };
      }
    }
    return { handler: currentNode.handlers.get(method), params };
  }
}

const router = new Router();
let moduleLoaderInstance: ModuleLoader | null = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    const method = req.method || 'GET';
    const { handler, params } = router.findRoute(method, req.url || '/');

    if (!handler || !moduleLoaderInstance) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const requestObject = createRequestObject(req, body);

    const paramsPairs = new Map<string, HashPair>();
    for (const [key, value] of params.entries()) {
      const lumenKey = new LumenString(key);
      const lumenValue = new LumenString(value);
      paramsPairs.set(lumenKey.hashKey(), { key: lumenKey, value: lumenValue });
    }
    const paramsHash = new LumenHash(paramsPairs);

    const result = applyFunction(handler, [requestObject, paramsHash], moduleLoaderInstance);

    if (result.type() === 'ERROR') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${(result as LumenError).message}`);
    } else if (result instanceof LumenRecord && result.name === 'Response') {
      const status = (result.fields.get('status') as LumenInteger)?.value || 200;
      const responseBody = (result.fields.get('body') as LumenString)?.value || '';

      const headersObject: { [key: string]: string } = { 'Content-Type': 'text/plain' };
      const lumenHeaders = result.fields.get('headers') as LumenHash | undefined;
      if (lumenHeaders) {
        for (const { key, value } of lumenHeaders.pairs.values()) {
          if (key instanceof LumenString && value instanceof LumenString) {
            headersObject[key.value] = value.value;
          }
        }
      }

      res.writeHead(status, headersObject);
      res.end(responseBody);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Handler must return a Response object');
    }
  });
});

server.on('error', (e) => console.error('[HTTP Server Error]', e));

function addRoute(method: string, args: LumenObject[]): LumenObject {
  if (args.length !== 2) {
    return new LumenError(`'${method.toLowerCase()}' expects 2 arguments: route and handler`);
  }
  const route = args[0] as LumenString;
  const handler = args[1] as LumenFunction;

  if (!(route instanceof LumenString) || !(handler instanceof LumenFunction)) {
    return new LumenError(
      `'${method.toLowerCase()}' expects a string route and a function handler`,
    );
  }

  router.addRoute(method, route.value, handler);

  return NULL;
}

export const netHttp: NativeModule = {
  types: new Map([
    ['Request', httpTypes.get('Request')!],
    ['Response', httpTypes.get('Response')!],
    ['get', httpTypes.get('get')!],
    ['post', httpTypes.get('post')!],
    ['listen', httpTypes.get('listen')!],
  ]),
  values: new Map([
    ['Request', NULL],
    ['get', new LumenBuiltin((loader, ...args) => addRoute('GET', args))],
    ['post', new LumenBuiltin((loader, ...args) => addRoute('POST', args))],
    [
      'listen',
      new LumenBuiltin((loader, ...args) => {
        moduleLoaderInstance = loader;
        if (args.length < 1 || !(args[0] instanceof LumenInteger)) {
          return new LumenError('listen expects an integer port number');
        }
        const port = (args[0] as LumenInteger).value;
        const callback = args.length > 1 ? (args[1] as LumenFunction) : null;

        server.listen(port, () => {
          if (callback && callback instanceof LumenFunction) {
            applyFunction(callback, [], loader);
          }
        });

        setInterval(() => {}, 1 << 30);

        return NULL;
      }),
    ],
  ]),
  constructors: new Map([
    [
      'Response',
      {
        type: httpTypes.get('ResponseConstructor')! as FunctionType,
        value: new LumenBuiltin((loader, ...args) => {
          if (args.length < 2 || args.length > 3)
            return new LumenError(
              'Response constructor expects 2 or 3 arguments: status, body, and optional headers',
            );
          const status = args[0] as LumenInteger;
          const body = args[1] as LumenString;
          const headers = (args[2] as LumenHash) || new LumenHash(new Map());

          const fields = new Map<string, LumenObject>([
            ['status', status],
            ['body', body],
            ['headers', headers],
          ]);
          return new LumenRecord('Response', fields);
        }),
      },
    ],
    [
      'json',
      {
        type: httpTypes.get('json')! as FunctionType,
        value: new LumenBuiltin((loader, ...args) => {
          if (args.length !== 1) {
            return new LumenError('Response.json expects 1 argument: the object to serialize.');
          }
          const obj = args[0];
          const jsonString = stringifyRecursive(obj, 1);

          if (jsonString instanceof Error) {
            return new LumenError(`Failed to serialize object to JSON: ${jsonString.message}`);
          }

          const status = new LumenInteger(200);
          const body = new LumenString(jsonString);

          const headers = new LumenHash(
            new Map([
              [
                'Content-Type',
                {
                  key: new LumenString('Content-Type'),
                  value: new LumenString('application/json'),
                },
              ],
            ]),
          );

          const fields = new Map<string, LumenObject>([
            ['status', status],
            ['body', body],
            ['headers', headers],
          ]);
          return new LumenRecord('Response', fields);
        }),
      },
    ],
  ]),
};
