import { describe, expect, it, vi } from 'vitest';

import { SerialQueue } from '../src/queue.js';

const silentLogger = { error: () => undefined };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('SerialQueue', () => {
  it('serializes jobs for the same key', async () => {
    const queue = new SerialQueue(silentLogger);
    const events: string[] = [];

    const first = deferred<void>();
    const second = deferred<void>();

    queue.enqueue('a', async () => {
      events.push('start-1');
      await first.promise;
      events.push('end-1');
    });

    queue.enqueue('a', async () => {
      events.push('start-2');
      await second.promise;
      events.push('end-2');
    });

    await new Promise((r) => setImmediate(r));
    expect(events).toEqual(['start-1']);
    first.resolve();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(events).toEqual(['start-1', 'end-1', 'start-2']);
    second.resolve();
    expect(await queue.drain(1_000)).toBe(true);
    expect(events).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('runs jobs for different keys in parallel', async () => {
    const queue = new SerialQueue(silentLogger);
    const events: string[] = [];

    const aDone = deferred<void>();
    const bDone = deferred<void>();

    queue.enqueue('a', async () => {
      events.push('start-a');
      await aDone.promise;
      events.push('end-a');
    });

    queue.enqueue('b', async () => {
      events.push('start-b');
      await bDone.promise;
      events.push('end-b');
    });

    await new Promise((r) => setImmediate(r));
    expect([...events].sort()).toEqual(['start-a', 'start-b']);
    bDone.resolve();
    aDone.resolve();
    expect(await queue.drain(1_000)).toBe(true);
  });

  it('does not poison the queue when a job throws', async () => {
    const logger = { error: vi.fn() };
    const queue = new SerialQueue(logger);

    queue.enqueue('a', async () => {
      throw new Error('boom');
    });
    const second = vi.fn().mockResolvedValue(undefined);
    queue.enqueue('a', second);

    expect(await queue.drain(1_000)).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('drain returns false when timeout elapses', async () => {
    const queue = new SerialQueue(silentLogger);
    const blocker = deferred<void>();
    queue.enqueue('a', () => blocker.promise);
    const drained = await queue.drain(50);
    expect(drained).toBe(false);
    blocker.resolve();
    await queue.drain(1_000);
  });
});
