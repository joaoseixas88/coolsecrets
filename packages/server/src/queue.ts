export type Job = () => Promise<void>;

export interface QueueLogger {
  error(payload: Record<string, unknown>, message?: string): void;
}

export class SerialQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private activeCount = 0;

  constructor(private readonly logger: QueueLogger) {}

  public enqueue(key: string, job: Job): void {
    this.activeCount += 1;
    const previous = this.tails.get(key) ?? Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await job();
        } catch (error) {
          this.logger.error(
            { err: serializeError(error), key },
            'Queued job failed without recovery',
          );
        }
      })
      .finally(() => {
        this.activeCount -= 1;
        if (this.tails.get(key) === next) {
          this.tails.delete(key);
        }
      });

    this.tails.set(key, next);
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public async drain(timeoutMs: number): Promise<boolean> {
    if (this.activeCount === 0) return true;

    const deadline = Date.now() + timeoutMs;
    while (this.activeCount > 0) {
      if (Date.now() >= deadline) return false;
      await sleep(Math.min(50, Math.max(10, deadline - Date.now())));
    }
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
