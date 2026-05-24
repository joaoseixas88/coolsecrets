import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  clean: true,
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  noExternal: ['@coolsecrets/shared'],
  banner: { js: '#!/usr/bin/env node' },
  shims: false,
  sourcemap: true,
});
