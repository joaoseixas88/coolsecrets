export interface RetryLogger {
  warn(payload: Record<string, unknown>, message?: string): void;
}

export interface WithRetryOptions {
  delaysMs: number[];
  logger?: RetryLogger;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions,
): Promise<T> {
  const sleepFn = options.sleepFn ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = options.delaysMs.length + 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = options.delaysMs[attempt];
      if (delay === undefined) break;
      options.logger?.warn(
        {
          attempt: attempt + 1,
          nextDelayMs: delay,
          err: error instanceof Error ? error.message : String(error),
        },
        'Retrying after failure',
      );
      await sleepFn(delay);
    }
  }

  throw lastError;
}
