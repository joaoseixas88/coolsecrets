import { HttpCoolifyClient } from '@coolsecrets/shared';

import { loadConfig } from './config.js';
import { installShutdownHandlers } from './lifecycle.js';
import { InfisicalProvider } from './providers/infisical-provider.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const coolifyClient = new HttpCoolifyClient();
  const secretsProvider = new InfisicalProvider({
    apiUrl: config.INFISICAL_API_URL,
    clientId: config.INFISICAL_CLIENT_ID,
    clientSecret: config.INFISICAL_CLIENT_SECRET,
  });

  const { app, queue } = await createServer({
    coolifyClient,
    coolifyCredentials: {
      baseUrl: config.COOLIFY_BASE_URL,
      apiToken: config.COOLIFY_API_TOKEN,
    },
    secretsProvider,
    signingSecret: config.INFISICAL_SIGNING_SECRET,
    toleranceSeconds: config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    fastifyOptions: { logger: { level: config.LOG_LEVEL } },
  });

  installShutdownHandlers({
    app,
    queue,
    drainTimeoutMs: config.SHUTDOWN_DRAIN_TIMEOUT_MS,
  });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error({ err: error instanceof Error ? error.message : String(error) }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
