import { Command } from 'commander';

import { HttpCoolifyClient, type CoolifyClient } from '@coolsecrets/shared';

import { FileConfigStore, type ConfigStore } from './config-store.js';
import { InteractiveInitPrompter, type InitPrompter } from './init-prompter.js';
import { InitCommand } from './init-command.js';
import { SyncCommand } from './sync-command.js';

export interface CreateCliOptions {
  cwd?: string;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  configStore?: ConfigStore;
  coolifyClient?: CoolifyClient;
  prompter?: InitPrompter;
}

export class CoolSecretsCli {
  private readonly cwd: string;
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WritableStream;
  private readonly stderr: NodeJS.WritableStream;
  private readonly configStore: ConfigStore;
  private readonly coolifyClient: CoolifyClient;
  private readonly prompter: InitPrompter;
  private readonly program: Command;

  constructor(options: CreateCliOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.configStore = options.configStore ?? new FileConfigStore();
    this.coolifyClient = options.coolifyClient ?? new HttpCoolifyClient();
    this.prompter = options.prompter ?? new InteractiveInitPrompter();
    this.program = this.createProgram();
  }

  public getProgram(): Command {
    return this.program;
  }

  private createProgram(): Command {
    const program = new Command()
      .name('coolsecrets')
      .description('CLI to sync secrets from stdin into Coolify applications')
      .version('0.1.0')
      .option('--init', 'Initialize Coolify settings for the current directory')
      .configureOutput({
        writeOut: (message) => this.stdout.write(message),
        writeErr: (message) => this.stderr.write(message),
      })
      .showHelpAfterError()
      .exitOverride();

    this.configureInitCommand(program);
    this.configureSyncCommand(program);
    this.configureDefaultAction(program);

    return program;
  }

  private configureInitCommand(program: Command): void {
    const initCommand = program
      .command('init')
      .description('Initialize Coolify settings for the current directory');

    initCommand.action(async () => {
      await this.runInit(initCommand);
    });
  }

  private configureSyncCommand(program: Command): void {
    const syncCommand = program
      .command('sync')
      .description('Sync a piped JSON secrets payload into the linked Coolify application');

    syncCommand.action(async () => {
      await this.runSync(syncCommand);
    });
  }

  private configureDefaultAction(program: Command): void {
    program.action(async () => {
      if (program.opts<{ init?: boolean }>().init) {
        await this.runInit(program);
        return;
      }

      await this.runSync(program);
    });
  }

  private async runInit(command: Command): Promise<void> {
    try {
      await new InitCommand({
        cwd: this.cwd,
        stdout: this.stdout,
        configStore: this.configStore,
        coolifyClient: this.coolifyClient,
        prompter: this.prompter,
      }).execute();
    } catch (error) {
      command.error(error instanceof Error ? error.message : 'Unexpected init error.', {
        code: 'coolsecrets.init',
        exitCode: 1,
      });
    }
  }

  private async runSync(command: Command): Promise<void> {
    try {
      await new SyncCommand({
        cwd: this.cwd,
        stdin: this.stdin,
        stdout: this.stdout,
        configStore: this.configStore,
        coolifyClient: this.coolifyClient,
      }).execute();
    } catch (error) {
      command.error(error instanceof Error ? error.message : 'Unexpected sync error.', {
        code: 'coolsecrets.sync',
        exitCode: 1,
      });
    }
  }
}

export function createCli(options: CreateCliOptions = {}): Command {
  return new CoolSecretsCli(options).getProgram();
}
