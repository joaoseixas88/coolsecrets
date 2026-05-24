# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`coolsecrets` é um monorepo pnpm com três pacotes:

- **`packages/cli`** (`coolsecrets`, publicável no npm): CLI que recebe um JSON do `infisical export --format=json` via stdin e faz upsert das envs em uma aplicação Coolify. Entrypoint: `dist/index.js` (bin `coolsecrets`).
- **`packages/server`** (`@coolsecrets/server`, deploy via Docker): servidor Fastify que recebe webhooks `POST /infisical/:coolifyUuid` do Infisical, busca os secrets via API e sincroniza no Coolify. Stateless (config em env vars).
- **`packages/shared`** (`@coolsecrets/shared`, interno): cliente Coolify (`HttpCoolifyClient`), parser do export Infisical (`InfisicalExportParser`), Zod schemas (`ZodSchemaValidator`), tipos comuns. CLI e server consomem como `workspace:*`.

## Commands

Rodar da raiz do workspace:

- `pnpm install` — instala todas as dependências
- `pnpm build:shared` — build do `@coolsecrets/shared` (gera `dist/` necessário para CLI/server resolverem o pacote)
- `pnpm build` — build topológico de todos os pacotes (`pnpm -r --workspace-concurrency=1 build`)
- `pnpm typecheck` — builda `shared` e roda `tsc -p tsconfig.json` em todos os pacotes
- `pnpm test` — builda `shared` e roda `vitest run` em todos os pacotes
- `pnpm dev:cli` — CLI via `tsx`
- `pnpm dev:server` — server via `tsx watch`

Por pacote:
- `pnpm --filter coolsecrets <script>` — CLI
- `pnpm --filter @coolsecrets/server <script>` — server
- `pnpm --filter @coolsecrets/shared <script>` — shared

Single test: `pnpm --filter @coolsecrets/server vitest run test/queue.test.ts -t "serializes jobs"`.

Package manager pinado em `pnpm@10.26.0`; Node `>=20`.

## Shared build dependency

`@coolsecrets/shared` é simbolicamente linkado nos workspaces, mas o `main`/`types` apontam para `dist/`. Por isso o root `test`/`typecheck` faz `build:shared` antes — se editar shared, rode `pnpm build:shared` (ou `pnpm test`/`pnpm typecheck` na raiz) para o CLI/server enxergarem as mudanças.

## CLI architecture

A CLI tem dois comandos — `init` e `sync` — wired em `packages/cli/src/create-cli.ts`. `CoolSecretsCli` é uma shell fina do Commander com construtor injetável (`ConfigStore`, `CoolifyClient`, `InitPrompter`, stdin/stdout/stderr/cwd). Produção usa as implementações concretas (file/HTTP/inquirer); testes passam mocks via `createCli(options)`. `--init` é um flag root alias para o subcomando `init` (ver `configureDefaultAction`); sem flag e sem subcomando, a ação default roda `sync`.

Estado vive em dois arquivos JSON com mode `0o600`:

- **Credenciais globais** (`baseUrl`, `apiToken`): `$XDG_CONFIG_HOME/coolsecrets/config.json` ou `~/.config/coolsecrets/config.json`.
- **Binding local** (`applicationId`, `applicationName`, `projectName`): `.coolsecrets.json` no cwd.

`sync` falha se algum dos dois faltar, apontando para `coolsecrets init`.

## Server architecture

Boot em `packages/server/src/index.ts`: valida env vars via Zod (`config.ts`, fail-fast), instancia `HttpCoolifyClient` + `InfisicalProvider`, monta Fastify via `createServer` e registra shutdown handlers.

Env vars obrigatórias: `COOLIFY_BASE_URL`, `COOLIFY_API_TOKEN`, `INFISICAL_SIGNING_SECRET`, `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`. Opcionais (com default): `PORT=3000`, `HOST=0.0.0.0`, `LOG_LEVEL=info`, `INFISICAL_API_URL=https://app.infisical.com`, `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300`, `SHUTDOWN_DRAIN_TIMEOUT_MS=30000`.

Fluxo `POST /infisical/:coolifyUuid`:

1. Body é capturado como `Buffer` num content-type parser custom (em `server.ts`) que armazena em `request.rawBody` — necessário porque o HMAC é computado sobre os bytes originais, não sobre o JSON re-serializado.
2. `webhook-verifier.ts` valida header `x-infisical-signature` (`t=<ts>;v1=<hex>`): timestamp dentro da tolerância e HMAC-SHA256 de `${t}.${rawBody}` contra `INFISICAL_SIGNING_SECRET` em `timingSafeEqual`. Falha → 401.
3. Payload validado por Zod (`event`, `project.projectId`, `project.environment`, `project.secretPath`). Falha → 400.
4. Se `event !== 'secrets.modified'`: 200 `{ skipped: true }`, no-op (eventos como `test` ou `secrets.rotation-failed`).
5. Caso contrário: enfileira via `SerialQueue.enqueue(coolifyUuid, syncJob)` e responde **202 Accepted** imediatamente.

`syncJob`:
1. `InfisicalProvider.listSecrets()` chama `POST /api/v1/auth/universal-auth/login` (com cache em memória até ~60s antes de expirar) e depois `GET /api/v4/secrets?projectId&environment&secretPath&recursive=true`.
2. Achata `secrets[]` em `Record<string,string>` (último vence em conflito de chave entre pastas).
3. `InfisicalExportParser.fromObject()` (no shared, expôe a transformação sem precisar de JSON) gera o array de envs.
4. `withRetry` (`retry.ts`) chama `coolifyClient.syncApplicationEnvs` com backoff `[1s, 4s, 16s]`; falha final é logada.

`SerialQueue` (in-memory): tail de `Promise<void>` por `coolifyUuid` garante serialização **por destino** (e paralelismo entre destinos). Erros em jobs não envenenam a fila — são capturados e logados. `drain(timeoutMs)` aguarda `activeCount === 0` — usado no SIGTERM/SIGINT em `lifecycle.ts` (que também chama `app.close()` antes de drenar).

`GET /healthz` retorna 200 enquanto o processo está vivo.

## Coolify integration (shared)

`HttpCoolifyClient` em `packages/shared/src/coolify-client.ts` faz:

- `GET /api/v1/applications` — usado pelo `init` da CLI
- `PATCH /api/v1/applications/:id/envs/bulk` com `{ data: [...] }` — usado pelo `sync` da CLI e pelo server. **Upsert apenas**, não deleta chaves removidas no Infisical.

Auth: `Authorization: Bearer <apiToken>`. URLs construídas com `new URL(..., \`${baseUrl}/\`)`; o schema strip o trailing slash do `baseUrl`.

## Schemas

`packages/shared/src/schemas.ts` (`ZodSchemaValidator`) valida config files, payloads do Coolify (lista de apps aceita bare array ou `{ data: [...] }`, id resolve de `id`/`uuid`, projectName de `project.name`/`projectName`/`project_name`) e o export do Infisical. **Ajuste o schema, não os call sites** quando a API Coolify mudar.

Schemas específicos do server (webhook payload, resposta de `/api/v4/secrets`) vivem inline nos arquivos do server — eles não fazem sentido fora desse contexto.

## Stdin handling (CLI)

`read-stdin.ts` retorna `null` quando stdin `isTTY` (nenhum pipe). `SyncCommand` traduz isso na mensagem "No input received from stdin." — o teste depende desse comportamento, preserve-o ao refatorar.

## Error flow (CLI)

Command classes throw `Error`; `createCli` captura em `runInit`/`runSync` e chama `command.error(...)` do Commander para sair non-zero com a mensagem em stderr. `exitOverride()` está ativo para que `parseAsync` rejeite com `CommanderError` em vez de `process.exit` — necessário para o test suite.

## Conventions

- ESM only (`"type": "module"`). Imports internos devem usar a extensão `.js` mesmo que o source seja `.ts` (NodeNext).
- Dependências injetadas via construtor com interface types (`ConfigStore`, `CoolifyClient`, `InitPrompter`, `SchemaValidator`, `SecretsProvider`). Adicione colaboradores novos no mesmo padrão para manter testabilidade.
- Sem util de logging próprio — CLI escreve direto nos streams `stdout`/`stderr` injetados; server usa o logger Pino do Fastify (`request.log`, `app.log`).
- Imports do `@coolsecrets/shared` via barrel: `import { HttpCoolifyClient, type CoolifyCredentials } from '@coolsecrets/shared'` (nunca alcançar arquivos internos do shared).
