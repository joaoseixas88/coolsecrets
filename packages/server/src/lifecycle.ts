import type { FastifyInstance } from 'fastify';

import type { SerialQueue } from './queue.js';

export interface ShutdownOptions {
  app: FastifyInstance;
  queue: SerialQueue;
  drainTimeoutMs: number;
  exit?: (code: number) => never;
}

export function installShutdownHandlers(options: ShutdownOptions): void {
  const exit = options.exit ?? ((code: number): never => process.exit(code));
  let shuttingDown = false;

  const handler = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    options.app.log.info({ signal }, 'Received shutdown signal; draining');
    try {
      await options.app.close();
    } catch (error) {
      options.app.log.error({ err: serialize(error) }, 'Fastify close failed');
    }

    const drained = await options.queue.drain(options.drainTimeoutMs);
    if (!drained) {
      options.app.log.warn(
        { drainTimeoutMs: options.drainTimeoutMs, remaining: options.queue.getActiveCount() },
        'Drain timeout exceeded; exiting with pending jobs',
      );
      exit(1);
    } else {
      options.app.log.info('Drain complete; exiting cleanly');
      exit(0);
    }
  };

  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}

function serialize(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}
