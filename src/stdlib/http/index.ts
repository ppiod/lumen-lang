import fastify, { FastifyInstance } from 'fastify';
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
  LumenBoolean,
} from '@runtime/objects.js';
import { createRequestObject } from './objects.js';
import { httpTypes } from './types.js';
import { FunctionType } from '@syntax/type.js';
import type { NativeModule } from '@stdlib/index.js';
import { stringifyRecursive } from '@stdlib/json/index.js';

let server: FastifyInstance | null = null;
const pendingRoutes: any[] = [];

function addRoute(method: string, args: LumenObject[], loader: ModuleLoader): LumenObject {
  if (server) {
    return new LumenError(`Cannot define new routes after the server has started listening.`);
  }
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

  pendingRoutes.push({ method, route, handler, loader });

  return NULL;
}

export const netHttp: NativeModule = {
  types: new Map([
    ['Request', httpTypes.get('Request')!],
    ['Response', httpTypes.get('Response')!],
    ['get', httpTypes.get('get')!],
    ['post', httpTypes.get('post')!],
    ['put', httpTypes.get('put')!],
    ['delete', httpTypes.get('delete')!],
    ['patch', httpTypes.get('patch')!],
    ['listen', httpTypes.get('listen')!],
  ]),
  values: new Map([
    ['Request', NULL],
    ['get', new LumenBuiltin((loader, ...args) => addRoute('GET', args, loader))],
    ['post', new LumenBuiltin((loader, ...args) => addRoute('POST', args, loader))],
    ['put', new LumenBuiltin((loader, ...args) => addRoute('PUT', args, loader))],
    ['delete', new LumenBuiltin((loader, ...args) => addRoute('DELETE', args, loader))],
    ['patch', new LumenBuiltin((loader, ...args) => addRoute('PATCH', args, loader))],
    [
      'listen',
      new LumenBuiltin((loader, ...args) => {
        if (server) {
          return new LumenError('Server is already listening.');
        }

        if (args.length < 2) {
          return new LumenError('listen expects at least 2 arguments: port and callback');
        }

        const port = (args[0] as LumenInteger).value;
        const callback = args[1] as LumenFunction;
        const options = args[2];

        let useLogger = false;
        if (options) {
          if (options instanceof LumenBoolean) {
            useLogger = options.value;
          } else if (options instanceof LumenHash) {
            const loggerOption = options.pairs.get(new LumenString('logger').hashKey());
            if (loggerOption && loggerOption.value instanceof LumenBoolean) {
              useLogger = loggerOption.value.value;
            }
          }
        }

        server = fastify({
          logger: useLogger,
          routerOptions: {
            ignoreTrailingSlash: true,
          },
        });

        for (const r of pendingRoutes) {
          server.route({
            method: r.method.toUpperCase() as any,
            url: r.route.value,
            handler: async (request, reply) => {
              const requestObject = createRequestObject(request);
              const params = request.params as Record<string, string>;
              const paramsPairs = new Map<string, HashPair>();
              for (const [key, value] of Object.entries(params)) {
                const lumenKey = new LumenString(key);
                const lumenValue = new LumenString(value);
                paramsPairs.set(lumenKey.hashKey(), { key: lumenKey, value: lumenValue });
              }
              const paramsHash = new LumenHash(paramsPairs);
              const result = applyFunction(r.handler, [requestObject, paramsHash], r.loader);

              if (result.type() === 'ERROR') {
                reply.status(500).send(`Server Error: ${(result as LumenError).message}`);
              } else if (result instanceof LumenRecord && result.name === 'Response') {
                const status = (result.fields.get('status') as LumenInteger)?.value || 200;
                const body = (result.fields.get('body') as LumenString)?.value || '';
                const headersObject: { [key: string]: string } = {};
                const lumenHeaders = result.fields.get('headers') as LumenHash | undefined;
                if (lumenHeaders) {
                  for (const { key, value } of lumenHeaders.pairs.values()) {
                    if (key instanceof LumenString && value instanceof LumenString) {
                      headersObject[key.value] = value.value;
                    }
                  }
                }
                reply.headers(headersObject).status(status).send(body);
              } else {
                reply.status(500).send('Handler must return a Response object');
              }
            },
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        server.listen({ port, host: '0.0.0.0' }, (err, _address) => {
          if (err) {
            console.error(`[HTTP Server Error]`, err);
            process.exit(1);
          }
          if (callback instanceof LumenFunction) {
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
    [
      'html',
      {
        type: httpTypes.get('html')! as FunctionType,
        value: new LumenBuiltin((loader, ...args) => {
          if (args.length !== 1 || !(args[0] instanceof LumenString)) {
            return new LumenError('Response.html expects 1 argument: the html string.');
          }
          const status = new LumenInteger(200);
          const body = args[0] as LumenString;
          const headers = new LumenHash(
            new Map([
              [
                'Content-Type',
                {
                  key: new LumenString('Content-Type'),
                  value: new LumenString('text/html'),
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
