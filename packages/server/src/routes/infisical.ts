import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  InfisicalExportParser,
  type CoolifyClient,
  type CoolifyCredentials,
} from '@coolsecrets/shared';

import type { SecretsProvider } from '../providers/secrets-provider.js';
import type { SerialQueue } from '../queue.js';
import { withRetry } from '../retry.js';
import {
  InvalidWebhookSignatureError,
  verifyInfisicalSignature,
} from '../webhook-verifier.js';

const SYNCED_EVENT = 'secrets.modified';

const webhookPayloadSchema = z.object({
  event: z.string().min(1),
  project: z.object({
    projectId: z.string().min(1),
    environment: z.string().min(1),
    secretPath: z.string().min(1).default('/'),
  }),
  timestamp: z.number().optional(),
});

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export interface InfisicalRouteDeps {
  coolifyClient: CoolifyClient;
  coolifyCredentials: CoolifyCredentials;
  secretsProvider: SecretsProvider;
  queue: SerialQueue;
  signingSecret: string;
  toleranceSeconds: number;
  retryDelaysMs: number[];
  parser?: InfisicalExportParser;
}

export async function registerInfisicalRoute(
  app: FastifyInstance,
  deps: InfisicalRouteDeps,
): Promise<void> {
  const parser = deps.parser ?? new InfisicalExportParser();

  app.post<{
    Params: { coolifyUuid: string };
  }>('/infisical/:coolifyUuid', async (request, reply) => {
    const rawBody = getRawBody(request);
    if (!rawBody) {
      return reply.code(400).send({ error: 'Missing request body.' });
    }

    try {
      verifyInfisicalSignature({
        rawBody,
        header: getHeader(request, 'x-infisical-signature'),
        secret: deps.signingSecret,
        toleranceSeconds: deps.toleranceSeconds,
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        request.log.warn({ err: error.message }, 'Rejected webhook with invalid signature');
        return reply.code(401).send({ error: 'Invalid signature.' });
      }
      throw error;
    }

    const parsed = webhookPayloadSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid webhook payload.', issues: parsed.error.issues });
    }

    const payload = parsed.data;
    const { coolifyUuid } = request.params;

    if (payload.event !== SYNCED_EVENT) {
      request.log.info(
        { event: payload.event, coolifyUuid },
        'Ignoring webhook event (not secrets.modified)',
      );
      return reply.code(200).send({ skipped: true, reason: 'unsupported_event' });
    }

    deps.queue.enqueue(coolifyUuid, async () => {
      await runSyncJob({
        coolifyUuid,
        payload,
        parser,
        deps,
        log: request.log,
      });
    });

    return reply.code(202).send({ queued: true });
  });
}

interface RunSyncJobArgs {
  coolifyUuid: string;
  payload: WebhookPayload;
  parser: InfisicalExportParser;
  deps: InfisicalRouteDeps;
  log: { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
}

async function runSyncJob(args: RunSyncJobArgs): Promise<void> {
  const { coolifyUuid, payload, parser, deps, log } = args;
  log.info(
    {
      coolifyUuid,
      projectId: payload.project.projectId,
      environment: payload.project.environment,
      secretPath: payload.project.secretPath,
    },
    'Starting Coolify sync',
  );

  const secrets = await deps.secretsProvider.listSecrets({
    projectId: payload.project.projectId,
    environment: payload.project.environment,
    secretPath: payload.project.secretPath,
  });

  if (Object.keys(secrets).length === 0) {
    log.warn({ coolifyUuid }, 'Infisical returned no secrets; skipping Coolify update');
    return;
  }

  const envs = parser.fromObject(secrets);

  await withRetry(
    () => deps.coolifyClient.syncApplicationEnvs(deps.coolifyCredentials, coolifyUuid, envs),
    {
      delaysMs: deps.retryDelaysMs,
      logger: { warn: (obj, msg) => log.warn(obj, msg) },
    },
  );

  log.info({ coolifyUuid, envCount: envs.length }, 'Coolify sync completed');
}

function getRawBody(request: FastifyRequest): Buffer | null {
  const body = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  return Buffer.isBuffer(body) ? body : null;
}

function getHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}
