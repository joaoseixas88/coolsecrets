import { CommanderError } from 'commander';

import { createCli } from './create-cli.js';

async function main(): Promise<void> {
  const program = createCli();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}

void main();
