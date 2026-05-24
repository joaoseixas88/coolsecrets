import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import {
  ZodSchemaValidator,
  type CoolifyCredentials,
  type LocalBinding,
  type SchemaValidator,
} from '@coolsecrets/shared';

export interface ConfigStore {
  readGlobalConfig(): Promise<CoolifyCredentials | null>;
  saveGlobalConfig(config: CoolifyCredentials): Promise<void>;
  readLocalBinding(cwd: string): Promise<LocalBinding | null>;
  saveLocalBinding(cwd: string, binding: LocalBinding): Promise<void>;
}

export class FileConfigStore implements ConfigStore {
  constructor(private readonly validator: SchemaValidator = new ZodSchemaValidator()) {}

  public async readGlobalConfig(): Promise<CoolifyCredentials | null> {
    try {
      const contents = await readFile(this.getGlobalConfigPath(), 'utf8');
      return this.validator.parseGlobalConfig(JSON.parse(contents));
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  public async saveGlobalConfig(config: CoolifyCredentials): Promise<void> {
    const configPath = this.getGlobalConfigPath();
    const normalizedConfig = this.validator.parseGlobalConfig(config);

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  public async readLocalBinding(cwd: string): Promise<LocalBinding | null> {
    try {
      const contents = await readFile(this.getLocalConfigPath(cwd), 'utf8');
      return this.validator.parseLocalBinding(JSON.parse(contents));
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }

      throw error;
    }
  }

  public async saveLocalBinding(cwd: string, binding: LocalBinding): Promise<void> {
    const configPath = this.getLocalConfigPath(cwd);
    const normalizedBinding = this.validator.parseLocalBinding(binding);

    await writeFile(configPath, `${JSON.stringify(normalizedBinding, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private getGlobalConfigPath(): string {
    return path.join(this.getGlobalConfigDirectory(), 'config.json');
  }

  private getLocalConfigPath(cwd: string): string {
    return path.join(cwd, '.coolsecrets.json');
  }

  private getGlobalConfigDirectory(): string {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;

    if (xdgConfigHome) {
      return path.join(xdgConfigHome, 'coolsecrets');
    }

    return path.join(homedir(), '.config', 'coolsecrets');
  }

  private isMissingFileError(error: unknown): boolean {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
