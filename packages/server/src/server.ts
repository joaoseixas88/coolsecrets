import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { CoolifyClient, CoolifyCredentials } from '@coolsecrets/shared';

import type { SecretsProvider } from './providers/secrets-provider.js';
import { SerialQueue } from './queue.js';
import { registerHealthRoute } from './routes/health.js';
import { registerInfisicalRoute } from './routes/infisical.js';

export interface CreateServerDeps {
  coolifyClient: CoolifyClient;
  coolifyCredentials: CoolifyCredentials;
  secretsProvider: SecretsProvider;
  signingSecret: string;
  toleranceSeconds: number;
  retryDelaysMs?: number[];
  queue?: SerialQueue;
  fastifyOptions?: FastifyServerOptions;
}

export interface CreatedServer {
  app: FastifyInstance;
  queue: SerialQueue;
}

export async function createServer(deps: CreateServerDeps): Promise<CreatedServer> {
  const app = Fastify({
    logger: { level: 'info' },
    ...deps.fastifyOptions,
  });

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body: Buffer, done) => {
      (request as typeof request & { rawBody?: Buffer }).rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  const queue = deps.queue ?? new SerialQueue({ error: (obj, msg) => app.log.error(obj, msg) });

  await registerHealthRoute(app);
  await registerInfisicalRoute(app, {
    coolifyClient: deps.coolifyClient,
    coolifyCredentials: deps.coolifyCredentials,
    secretsProvider: deps.secretsProvider,
    queue,
    signingSecret: deps.signingSecret,
    toleranceSeconds: deps.toleranceSeconds,
    retryDelaysMs: deps.retryDelaysMs ?? [1_000, 4_000, 16_000],
  });

  return { app, queue };
}
