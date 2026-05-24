import {
  ZodSchemaValidator,
  type CoolifyClient,
  type CoolifyCredentials,
  type SchemaValidator,
} from '@coolsecrets/shared';

import type { ConfigStore } from './config-store.js';
import { formatApplicationLabel, type InitPrompter } from './init-prompter.js';

export interface RunInitOptions {
  cwd: string;
  stdout: NodeJS.WritableStream;
  configStore: ConfigStore;
  coolifyClient: CoolifyClient;
  prompter: InitPrompter;
}

interface ResolvedCredentials {
  credentials: CoolifyCredentials;
  shouldPersist: boolean;
}

export class InitCommand {
  constructor(
    private readonly options: RunInitOptions,
    private readonly validator: SchemaValidator = new ZodSchemaValidator(),
  ) {}

  public async execute(): Promise<void> {
    const { credentials, shouldPersist } = await this.resolveCredentials();
    const applications = await this.options.coolifyClient.listApplications(credentials);

    if (applications.length === 0) {
      throw new Error('No Coolify applications were found for the provided credentials.');
    }

    if (shouldPersist) {
      await this.options.configStore.saveGlobalConfig(credentials);
    }

    const application = await this.options.prompter.selectApplication(applications);

    await this.options.configStore.saveLocalBinding(this.options.cwd, {
      applicationId: application.id,
      applicationName: application.name,
      projectName: application.projectName,
    });

    this.options.stdout.write(
      `Linked current directory to ${formatApplicationLabel(application)}.\n`,
    );
  }

  private async resolveCredentials(): Promise<ResolvedCredentials> {
    const existingConfig = await this.options.configStore.readGlobalConfig();

    if (existingConfig) {
      return {
        credentials: existingConfig,
        shouldPersist: false,
      };
    }

    return {
      credentials: this.validator.normalizeCoolifyCredentials({
        baseUrl: await this.options.prompter.promptBaseUrl(),
        apiToken: await this.options.prompter.promptApiToken(),
      }),
      shouldPersist: true,
    };
  }
}

export async function runInit(options: RunInitOptions): Promise<void> {
  await new InitCommand(options).execute();
}
