import { describe, expect, it, vi } from 'vitest';

import { InfisicalProvider } from '../src/providers/infisical-provider.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('InfisicalProvider', () => {
  it('logs in once and reuses the cached token across listSecrets calls', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/auth/universal-auth/login')) {
        return jsonResponse({ accessToken: 'jwt-1', expiresIn: 3_600 });
      }
      return jsonResponse({
        secrets: [
          { secretKey: 'FOO', secretValue: 'bar' },
          { secretKey: 'BAZ', secretValue: 'qux' },
        ],
      });
    }) as unknown as typeof fetch;

    const provider = new InfisicalProvider({
      apiUrl: 'https://example.test',
      clientId: 'cid',
      clientSecret: 'csec',
      fetchFn,
      now: () => 1_000,
    });

    const first = await provider.listSecrets({
      projectId: 'p1',
      environment: 'prod',
      secretPath: '/',
    });
    const second = await provider.listSecrets({
      projectId: 'p1',
      environment: 'prod',
      secretPath: '/',
    });

    expect(first).toEqual({ FOO: 'bar', BAZ: 'qux' });
    expect(second).toEqual(first);

    const loginCalls = (fetchFn as unknown as { mock: { calls: [string][] } }).mock.calls.filter(
      ([url]) => url.endsWith('/api/v1/auth/universal-auth/login'),
    );
    expect(loginCalls).toHaveLength(1);
  });

  it('refreshes the token when it approaches expiry', async () => {
    let nowMs = 1_000;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/auth/universal-auth/login')) {
        return jsonResponse({ accessToken: `jwt-${nowMs}`, expiresIn: 60 });
      }
      return jsonResponse({ secrets: [] });
    }) as unknown as typeof fetch;

    const provider = new InfisicalProvider({
      apiUrl: 'https://example.test',
      clientId: 'cid',
      clientSecret: 'csec',
      fetchFn,
      now: () => nowMs,
    });

    await provider.listSecrets({ projectId: 'p1', environment: 'dev', secretPath: '/' });
    nowMs += 70_000; // jump past expiry
    await provider.listSecrets({ projectId: 'p1', environment: 'dev', secretPath: '/' });

    const loginCalls = (fetchFn as unknown as { mock: { calls: [string][] } }).mock.calls.filter(
      ([url]) => url.endsWith('/api/v1/auth/universal-auth/login'),
    );
    expect(loginCalls).toHaveLength(2);
  });

  it('flattens recursive secrets (last key wins on conflict)', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/auth/universal-auth/login')) {
        return jsonResponse({ accessToken: 'jwt', expiresIn: 3_600 });
      }
      return jsonResponse({
        secrets: [
          { secretKey: 'API_KEY', secretValue: 'root' },
          { secretKey: 'API_KEY', secretValue: 'nested' },
          { secretKey: 'DB_URL', secretValue: 'postgres://...' },
        ],
      });
    }) as unknown as typeof fetch;

    const provider = new InfisicalProvider({
      apiUrl: 'https://example.test',
      clientId: 'cid',
      clientSecret: 'csec',
      fetchFn,
    });

    const result = await provider.listSecrets({
      projectId: 'p1',
      environment: 'prod',
      secretPath: '/',
    });
    expect(result).toEqual({ API_KEY: 'nested', DB_URL: 'postgres://...' });
  });
});
