import { ZodSchemaValidator, type SchemaValidator } from './schemas.js';
import type {
  CoolifyApplication,
  CoolifyApplicationEnvironmentVariable,
  CoolifyCredentials,
} from './types.js';

export interface CoolifyClient {
  listApplications(config: CoolifyCredentials): Promise<CoolifyApplication[]>;
  syncApplicationEnvs(
    config: CoolifyCredentials,
    applicationId: string,
    environmentVariables: CoolifyApplicationEnvironmentVariable[],
  ): Promise<void>;
}

export class HttpCoolifyClient implements CoolifyClient {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly validator: SchemaValidator = new ZodSchemaValidator(),
  ) {}

  public async listApplications(config: CoolifyCredentials): Promise<CoolifyApplication[]> {
    const response = await this.fetchFn(this.buildApplicationsUrl(config.baseUrl), {
      method: 'GET',
      headers: this.buildHeaders(config),
    });

    if (!response.ok) {
      throw new Error(this.buildFetchErrorMessage('fetch applications', response));
    }

    return this.validator.parseApplicationsPayload(await response.json());
  }

  public async syncApplicationEnvs(
    config: CoolifyCredentials,
    applicationId: string,
    environmentVariables: CoolifyApplicationEnvironmentVariable[],
  ): Promise<void> {
    const response = await this.fetchFn(this.buildBulkEnvsUrl(config.baseUrl, applicationId), {
      method: 'PATCH',
      headers: this.buildHeaders(config),
      body: JSON.stringify({ data: environmentVariables }),
    });

    if (!response.ok) {
      throw new Error(this.buildFetchErrorMessage('sync application environment variables', response));
    }
  }

  private buildApplicationsUrl(baseUrl: string): string {
    return new URL('/api/v1/applications', `${baseUrl}/`).toString();
  }

  private buildBulkEnvsUrl(baseUrl: string, applicationId: string): string {
    return new URL(`/api/v1/applications/${applicationId}/envs/bulk`, `${baseUrl}/`).toString();
  }

  private buildHeaders(config: CoolifyCredentials): HeadersInit {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private buildFetchErrorMessage(action: string, response: Response): string {
    return `Failed to ${action} in Coolify (${response.status} ${response.statusText}).`;
  }
}
