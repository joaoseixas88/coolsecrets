import { input, password, select } from '@inquirer/prompts';

import type { CoolifyApplication } from '@coolsecrets/shared';

export interface InitPrompter {
  promptBaseUrl(): Promise<string>;
  promptApiToken(): Promise<string>;
  selectApplication(applications: CoolifyApplication[]): Promise<CoolifyApplication>;
}

export function formatApplicationLabel(application: CoolifyApplication): string {
  return application.projectName
    ? `${application.projectName} / ${application.name}`
    : application.name;
}

export class InteractiveInitPrompter implements InitPrompter {
  async promptBaseUrl(): Promise<string> {
    return input({
      message: 'Coolify base URL',
      validate: (value) => (value.trim().length > 0 ? true : 'Base URL is required.'),
    });
  }

  async promptApiToken(): Promise<string> {
    return password({
      message: 'Coolify API token',
      mask: '*',
      validate: (value) => (value.trim().length > 0 ? true : 'API token is required.'),
    });
  }

  async selectApplication(applications: CoolifyApplication[]): Promise<CoolifyApplication> {
    return select({
      message: 'Select the Coolify application for this directory',
      choices: applications.map((application) => ({
        name: formatApplicationLabel(application),
        value: application,
      })),
      pageSize: 12,
    });
  }
}
