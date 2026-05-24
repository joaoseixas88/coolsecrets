export interface SecretsProvider {
  listSecrets(scope: SecretScope): Promise<Record<string, string>>;
}

export interface SecretScope {
  projectId: string;
  environment: string;
  secretPath: string;
}
