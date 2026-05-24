import {
  InfisicalExportParser,
  type CoolifyClient,
  type CoolifyCredentials,
  type LocalBinding,
} from '@coolsecrets/shared';

import type { ConfigStore } from './config-store.js';
import { readStdin } from './read-stdin.js';

export interface RunSyncOptions {
  cwd: string;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  configStore: ConfigStore;
  coolifyClient: CoolifyClient;
}

export class SyncCommand {
  private static readonly noStdinMessage = [
    'No input received from stdin.',
    'Example: infisical export --env=prod --format=json | coolsecrets sync',
  ].join('\n');

  constructor(
    private readonly options: RunSyncOptions,
    private readonly parser: InfisicalExportParser = new InfisicalExportParser(),
  ) {}

  public async execute(): Promise<void> {
    const rawInput = await readStdin(this.options.stdin);

    if (rawInput === null) {
      throw new Error(SyncCommand.noStdinMessage);
    }

    const environmentVariables = this.parser.parse(rawInput);
    const credentials = await this.readGlobalConfig();
    const binding = await this.readLocalBinding();

    await this.options.coolifyClient.syncApplicationEnvs(
      credentials,
      binding.applicationId,
      environmentVariables,
    );

    this.options.stdout.write(
      `Synced ${environmentVariables.length} environment variable${environmentVariables.length === 1 ? '' : 's'} to ${this.formatBindingLabel(binding)}.\n`,
    );
  }

  private async readGlobalConfig(): Promise<CoolifyCredentials> {
    const config = await this.options.configStore.readGlobalConfig();

    if (config === null) {
      throw new Error('Coolify credentials are not configured. Run `coolsecrets init` first.');
    }

    return config;
  }

  private async readLocalBinding(): Promise<LocalBinding> {
    const binding = await this.options.configStore.readLocalBinding(this.options.cwd);

    if (binding === null) {
      throw new Error(
        'Current directory is not linked to a Coolify application. Run `coolsecrets init` first.',
      );
    }

    return binding;
  }

  private formatBindingLabel(binding: LocalBinding): string {
    return binding.projectName
      ? `${binding.projectName} / ${binding.applicationName}`
      : binding.applicationName;
  }
}
