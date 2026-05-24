import { Readable, Writable } from 'node:stream';

import { CommanderError } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import { createCli } from '../src/create-cli.js';

function createInput(chunks: string[], isTTY = false): NodeJS.ReadableStream {
  const input = Readable.from(chunks) as Readable & { isTTY?: boolean };
  input.isTTY = isTTY;
  return input;
}

function createOutput(): {
  stream: NodeJS.WritableStream;
  read: () => string;
} {
  let value = '';

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      value += chunk.toString();
      callback();
    },
  });

  return {
    stream,
    read: () => value,
  };
}

describe('createCli', () => {
  it('fails when no stdin input is provided', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const program = createCli({
      stdin: createInput([], true),
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    await expect(program.parseAsync(['node', 'coolsecrets'])).rejects.toBeInstanceOf(
      CommanderError,
    );

    expect(stderr.read()).toContain('No input received from stdin.');
    expect(stderr.read()).toContain('infisical export --env=prod --format=json | coolsecrets sync');
    expect(stdout.read()).toBe('');
  });

  it('syncs the piped Infisical JSON payload through the default command', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const syncApplicationEnvs = vi.fn().mockResolvedValue(undefined);
    const program = createCli({
      stdin: createInput(['{"DATABASE_URL":"postgres://localhost","API_KEY":"secret"}']),
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: '/workspace/service',
      configStore: {
        readGlobalConfig: vi.fn().mockResolvedValue({
          baseUrl: 'https://coolify.example.com',
          apiToken: 'secret-token',
        }),
        saveGlobalConfig: vi.fn().mockResolvedValue(undefined),
        readLocalBinding: vi.fn().mockResolvedValue({
          applicationId: 'app-1',
          applicationName: 'api',
          projectName: 'Platform',
        }),
        saveLocalBinding: vi.fn().mockResolvedValue(undefined),
      },
      coolifyClient: {
        listApplications: vi.fn().mockResolvedValue([]),
        syncApplicationEnvs,
      },
    });

    await expect(program.parseAsync(['node', 'coolsecrets'])).resolves.toBe(program);

    expect(syncApplicationEnvs).toHaveBeenCalledWith(
      {
        baseUrl: 'https://coolify.example.com',
        apiToken: 'secret-token',
      },
      'app-1',
      [
        {
          key: 'DATABASE_URL',
          value: 'postgres://localhost',
          is_preview: false,
          is_literal: false,
          is_multiline: false,
          is_shown_once: false,
        },
        {
          key: 'API_KEY',
          value: 'secret',
          is_preview: false,
          is_literal: false,
          is_multiline: false,
          is_shown_once: false,
        },
      ],
    );
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('Synced 2 environment variables to Platform / api.');
  });

  it('initializes global config and links the current directory to an application', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const applications = [
      { id: 'app-1', name: 'api', projectName: 'Platform' },
      { id: 'app-2', name: 'worker', projectName: 'Platform' },
    ];

    const prompter = {
      promptBaseUrl: vi.fn().mockResolvedValue('https://coolify.example.com/'),
      promptApiToken: vi.fn().mockResolvedValue('secret-token'),
      selectApplication: vi.fn().mockResolvedValue(applications[1]),
    };

    const configStore = {
      readGlobalConfig: vi.fn().mockResolvedValue(null),
      saveGlobalConfig: vi.fn().mockResolvedValue(undefined),
      readLocalBinding: vi.fn().mockResolvedValue(null),
      saveLocalBinding: vi.fn().mockResolvedValue(undefined),
    };

    const coolifyClient = {
      listApplications: vi.fn().mockResolvedValue(applications),
      syncApplicationEnvs: vi.fn().mockResolvedValue(undefined),
    };

    const program = createCli({
      stdin: createInput([], true),
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: '/workspace/service',
      prompter,
      configStore,
      coolifyClient,
    });

    await expect(program.parseAsync(['node', 'coolsecrets', 'init'])).resolves.toBe(program);

    expect(prompter.promptBaseUrl).toHaveBeenCalledTimes(1);
    expect(prompter.promptApiToken).toHaveBeenCalledTimes(1);
    expect(coolifyClient.listApplications).toHaveBeenCalledWith({
      baseUrl: 'https://coolify.example.com',
      apiToken: 'secret-token',
    });
    expect(configStore.saveGlobalConfig).toHaveBeenCalledWith({
      baseUrl: 'https://coolify.example.com',
      apiToken: 'secret-token',
    });
    expect(prompter.selectApplication).toHaveBeenCalledWith(applications);
    expect(configStore.saveLocalBinding).toHaveBeenCalledWith('/workspace/service', {
      applicationId: 'app-2',
      applicationName: 'worker',
      projectName: 'Platform',
    });
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('Linked current directory to Platform / worker.');
  });

  it('supports init as a root flag alias', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const applications = [{ id: 'app-1', name: 'api', projectName: 'Platform' }];

    const program = createCli({
      stdin: createInput([], true),
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: '/workspace/service',
      prompter: {
        promptBaseUrl: vi.fn().mockResolvedValue('https://coolify.example.com'),
        promptApiToken: vi.fn().mockResolvedValue('secret-token'),
        selectApplication: vi.fn().mockResolvedValue(applications[0]),
      },
      configStore: {
        readGlobalConfig: vi.fn().mockResolvedValue(null),
        saveGlobalConfig: vi.fn().mockResolvedValue(undefined),
        readLocalBinding: vi.fn().mockResolvedValue(null),
        saveLocalBinding: vi.fn().mockResolvedValue(undefined),
      },
      coolifyClient: {
        listApplications: vi.fn().mockResolvedValue(applications),
        syncApplicationEnvs: vi.fn().mockResolvedValue(undefined),
      },
    });

    await expect(program.parseAsync(['node', 'coolsecrets', '--init'])).resolves.toBe(program);

    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('Linked current directory to Platform / api.');
  });

  it('supports the explicit sync command', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const syncApplicationEnvs = vi.fn().mockResolvedValue(undefined);
    const program = createCli({
      stdin: createInput(['{"MULTILINE":"line 1\\nline 2"}']),
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: '/workspace/service',
      configStore: {
        readGlobalConfig: vi.fn().mockResolvedValue({
          baseUrl: 'https://coolify.example.com',
          apiToken: 'secret-token',
        }),
        saveGlobalConfig: vi.fn().mockResolvedValue(undefined),
        readLocalBinding: vi.fn().mockResolvedValue({
          applicationId: 'app-1',
          applicationName: 'api',
          projectName: 'Platform',
        }),
        saveLocalBinding: vi.fn().mockResolvedValue(undefined),
      },
      coolifyClient: {
        listApplications: vi.fn().mockResolvedValue([]),
        syncApplicationEnvs,
      },
    });

    await expect(program.parseAsync(['node', 'coolsecrets', 'sync'])).resolves.toBe(program);

    expect(syncApplicationEnvs).toHaveBeenCalledWith(
      {
        baseUrl: 'https://coolify.example.com',
        apiToken: 'secret-token',
      },
      'app-1',
      [
        {
          key: 'MULTILINE',
          value: 'line 1\nline 2',
          is_preview: false,
          is_literal: false,
          is_multiline: true,
          is_shown_once: false,
        },
      ],
    );
    expect(stderr.read()).toBe('');
    expect(stdout.read()).toContain('Synced 1 environment variable to Platform / api.');
  });

  it('accepts the array format produced by `infisical export --format=json`', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const syncApplicationEnvs = vi.fn().mockResolvedValue(undefined);
    const payload = JSON.stringify([
      { key: 'APP_KEY', value: 'abc', workspace: 'ws', type: 'shared', secretPath: '/' },
      { key: 'APP_URL', value: 'https://example.test', workspace: 'ws', type: 'shared', secretPath: '/' },
    ]);
    const program = createCli({
      stdin: createInput([payload]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd: '/workspace/service',
      configStore: {
        readGlobalConfig: vi.fn().mockResolvedValue({
          baseUrl: 'https://coolify.example.com',
          apiToken: 'secret-token',
        }),
        saveGlobalConfig: vi.fn().mockResolvedValue(undefined),
        readLocalBinding: vi.fn().mockResolvedValue({
          applicationId: 'app-1',
          applicationName: 'api',
          projectName: 'Platform',
        }),
        saveLocalBinding: vi.fn().mockResolvedValue(undefined),
      },
      coolifyClient: {
        listApplications: vi.fn().mockResolvedValue([]),
        syncApplicationEnvs,
      },
    });

    await expect(program.parseAsync(['node', 'coolsecrets', 'sync'])).resolves.toBe(program);

    expect(syncApplicationEnvs).toHaveBeenCalledWith(
      expect.anything(),
      'app-1',
      [
        expect.objectContaining({ key: 'APP_KEY', value: 'abc' }),
        expect.objectContaining({ key: 'APP_URL', value: 'https://example.test' }),
      ],
    );
    expect(stdout.read()).toContain('Synced 2 environment variables to Platform / api.');
  });
});
