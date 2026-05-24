import { z } from 'zod';

import type { SecretScope, SecretsProvider } from './secrets-provider.js';

const universalAuthLoginResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

const infisicalSecretSchema = z
  .object({
    secretKey: z.string().min(1),
    secretValue: z.string(),
  })
  .passthrough();

const listSecretsResponseSchema = z.object({
  secrets: z.array(infisicalSecretSchema).default([]),
});

interface CachedToken {
  value: string;
  expiresAtMs: number;
}

export interface InfisicalProviderOptions {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export class InfisicalProvider implements SecretsProvider {
  private cached: CachedToken | null = null;
  private inflightLogin: Promise<CachedToken> | null = null;
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(options: InfisicalProviderOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  public async listSecrets(scope: SecretScope): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    const url = new URL('/api/v4/secrets', `${this.apiUrl}/`);
    url.searchParams.set('projectId', scope.projectId);
    url.searchParams.set('environment', scope.environment);
    url.searchParams.set('secretPath', scope.secretPath);
    url.searchParams.set('recursive', 'true');

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list secrets from Infisical (${response.status} ${response.statusText}).`,
      );
    }

    const payload = listSecretsResponseSchema.parse(await response.json());
    const flattened: Record<string, string> = {};
    for (const secret of payload.secrets) {
      flattened[secret.secretKey] = secret.secretValue;
    }
    return flattened;
  }

  private async getAccessToken(): Promise<string> {
    const refreshThresholdMs = 60_000;
    if (this.cached && this.cached.expiresAtMs - this.now() > refreshThresholdMs) {
      return this.cached.value;
    }

    if (!this.inflightLogin) {
      this.inflightLogin = this.login().finally(() => {
        this.inflightLogin = null;
      });
    }

    const fresh = await this.inflightLogin;
    this.cached = fresh;
    return fresh.value;
  }

  private async login(): Promise<CachedToken> {
    const url = new URL('/api/v1/auth/universal-auth/login', `${this.apiUrl}/`);
    const response = await this.fetchFn(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to authenticate with Infisical (${response.status} ${response.statusText}).`,
      );
    }

    const parsed = universalAuthLoginResponseSchema.parse(await response.json());
    return {
      value: parsed.accessToken,
      expiresAtMs: this.now() + parsed.expiresIn * 1000,
    };
  }
}
