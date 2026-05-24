import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { CoolifyClient, CoolifyCredentials } from '@coolsecrets/shared';

import type { SecretsProvider } from '../src/providers/secrets-provider.js';
import { createServer } from '../src/server.js';

const SIGNING_SECRET = 'shh';
const COOLIFY_CREDENTIALS: CoolifyCredentials = {
  baseUrl: 'https://coolify.test',
  apiToken: 'token',
};

function sign(rawBody: string, timestamp: number): string {
  const sig = createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex');
  return `t=${timestamp};${sig}`;
}

interface BuildServerOpts {
  coolifyClient?: CoolifyClient;
  secretsProvider?: SecretsProvider;
}

async function build(opts: BuildServerOpts = {}) {
  const coolifyClient: CoolifyClient = opts.coolifyClient ?? {
    listApplications: vi.fn().mockResolvedValue([]),
    syncApplicationEnvs: vi.fn().mockResolvedValue(undefined),
  };
  const secretsProvider: SecretsProvider = opts.secretsProvider ?? {
    listSecrets: vi.fn().mockResolvedValue({ FOO: 'bar' }),
  };
  const { app, queue } = await createServer({
    coolifyClient,
    coolifyCredentials: COOLIFY_CREDENTIALS,
    secretsProvider,
    signingSecret: SIGNING_SECRET,
    toleranceSeconds: 300,
    retryDelaysMs: [],
    fastifyOptions: { logger: false },
  });
  return { app, queue, coolifyClient, secretsProvider };
}

describe('POST /infisical/:coolifyUuid', () => {
  it('returns 401 for an invalid signature', async () => {
    const { app, coolifyClient } = await build();
    const body = JSON.stringify({
      event: 'secrets.modified',
      project: { projectId: 'p', environment: 'prod', secretPath: '/' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/infisical/abc',
      headers: { 'content-type': 'application/json', 'x-infisical-signature': 't=0;v1=00' },
      payload: body,
    });
    expect(response.statusCode).toBe(401);
    expect(coolifyClient.syncApplicationEnvs).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 with skipped=true for non-secrets.modified events', async () => {
    const { app, coolifyClient } = await build();
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: 'test',
      project: { projectId: 'p', environment: 'prod', secretPath: '/' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/infisical/abc',
      headers: { 'content-type': 'application/json', 'x-infisical-signature': sign(body, ts) },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ skipped: true });
    expect(coolifyClient.syncApplicationEnvs).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 202 and triggers a sync for secrets.modified', async () => {
    const syncApplicationEnvs = vi.fn().mockResolvedValue(undefined);
    const listSecrets = vi.fn().mockResolvedValue({ FOO: 'bar', BAZ: 'multi\nline' });
    const { app, queue } = await build({
      coolifyClient: { listApplications: vi.fn(), syncApplicationEnvs },
      secretsProvider: { listSecrets },
    });

    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: 'secrets.modified',
      project: { projectId: 'proj-1', environment: 'prod', secretPath: '/' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/infisical/coolify-uuid',
      headers: { 'content-type': 'application/json', 'x-infisical-signature': sign(body, ts) },
      payload: body,
    });
    expect(response.statusCode).toBe(202);

    expect(await queue.drain(2_000)).toBe(true);

    expect(listSecrets).toHaveBeenCalledWith({
      projectId: 'proj-1',
      environment: 'prod',
      secretPath: '/',
    });
    expect(syncApplicationEnvs).toHaveBeenCalledWith(
      COOLIFY_CREDENTIALS,
      'coolify-uuid',
      [
        {
          key: 'FOO',
          value: 'bar',
          is_preview: false,
          is_literal: false,
          is_multiline: false,
          is_shown_once: false,
        },
        {
          key: 'BAZ',
          value: 'multi\nline',
          is_preview: false,
          is_literal: false,
          is_multiline: true,
          is_shown_once: false,
        },
      ],
    );
    await app.close();
  });

  it('serializes two webhooks for the same coolify uuid', async () => {
    const order: string[] = [];
    let resolveFirst!: () => void;
    const firstSync = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const syncApplicationEnvs = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push('start-1');
        await firstSync;
        order.push('end-1');
      })
      .mockImplementationOnce(async () => {
        order.push('start-2');
        order.push('end-2');
      });

    const { app, queue } = await build({
      coolifyClient: { listApplications: vi.fn(), syncApplicationEnvs },
    });

    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: 'secrets.modified',
      project: { projectId: 'p', environment: 'prod', secretPath: '/' },
    });
    const headers = { 'content-type': 'application/json', 'x-infisical-signature': sign(body, ts) };

    await app.inject({ method: 'POST', url: '/infisical/uuid', headers, payload: body });
    await app.inject({ method: 'POST', url: '/infisical/uuid', headers, payload: body });

    // Wait for first sync to start
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['start-1']);
    resolveFirst();

    expect(await queue.drain(2_000)).toBe(true);
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    await app.close();
  });

  it('responds 200 with healthz', async () => {
    const { app } = await build();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
