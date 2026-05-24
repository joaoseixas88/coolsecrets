# coolsecrets

Sync secrets from [Infisical](https://infisical.com) into [Coolify](https://coolify.io) applications.

Ships in two complementary pieces:

| Package | Distribution | When to use |
|---|---|---|
| [`coolsecrets`](https://www.npmjs.com/package/coolsecrets) (CLI) | `npm install -g coolsecrets` | Manual one-shot sync — pipe `infisical export` to a single Coolify app you linked locally. |
| `coolsecrets-server` (HTTP webhook receiver) | `ghcr.io/joaoseixas88/coolsecrets-server` | Continuous automatic sync — point Infisical webhooks at it and every secret change propagates to Coolify within seconds. |

Both share the same Coolify client and Infisical export parsing logic.

## CLI

Install and use:

```bash
npm install -g coolsecrets
coolsecrets init                                                # one-time, per directory
infisical export --env=prod --format=json | coolsecrets sync    # sync on demand
```

See [`packages/cli/README.md`](packages/cli/README.md) for the full reference.

## Server (Docker)

The server is a small Fastify app that exposes `POST /infisical/:coolifyUuid`. Infisical signs each webhook with HMAC-SHA256; the server verifies the signature, fetches the latest secrets from the Infisical API using a Machine Identity, and upserts them into the matching Coolify application — with an in-memory queue serializing concurrent webhooks per Coolify UUID and retrying transient Coolify failures.

### Run

Copy the example compose file and `.env`:

```bash
curl -O https://raw.githubusercontent.com/joaoseixas88/coolsecrets/main/docker-compose.example.yml
curl -O https://raw.githubusercontent.com/joaoseixas88/coolsecrets/main/.env.example
mv docker-compose.example.yml docker-compose.yml
mv .env.example .env
# edit .env with the 5 required values, then:
docker compose up -d
```

`GET /healthz` returns 200 once the server is up.

### Required env vars

| Name | What it is |
|---|---|
| `COOLIFY_BASE_URL` | URL of your Coolify instance (e.g. `https://coolify.example.com`) |
| `COOLIFY_API_TOKEN` | Coolify API token (Bearer) with permission to PATCH the target apps |
| `INFISICAL_SIGNING_SECRET` | The signing secret you configured on the Infisical webhook (used to verify `x-infisical-signature`) |
| `INFISICAL_CLIENT_ID` | Infisical Machine Identity (Universal Auth) Client ID |
| `INFISICAL_CLIENT_SECRET` | Infisical Machine Identity (Universal Auth) Client Secret |

Optional knobs with defaults: `PORT=3000`, `HOST=0.0.0.0`, `LOG_LEVEL=info`, `INFISICAL_API_URL=https://app.infisical.com`, `WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS=300`, `SHUTDOWN_DRAIN_TIMEOUT_MS=30000`.

### Infisical setup

In your Infisical project:

1. **Create a Machine Identity** under your organization → *Access Control → Identities*. Use *Universal Auth* and copy the Client ID + Client Secret. Add the identity to each project you want to sync, with `secrets:read` (the `Viewer` role works).
2. **Create a webhook** under the project → *Project Settings → Webhooks*:
   - URL: `https://<your-server>/infisical/<coolify-app-uuid>`
   - Secret: the same value you put in `INFISICAL_SIGNING_SECRET`
   - Event scope: pick the environment + secret path you want to sync

The server only acts on `secrets.modified` events; `test` and other events are acknowledged with 200 and no side effects.

## Behavior

- **Upsert only.** Removing a key in Infisical does not remove it in Coolify (the Coolify bulk-env endpoint does not delete missing keys). Use the Coolify UI to clean up stale keys.
- **Per-destination serialization.** The server processes one sync at a time per Coolify UUID; different UUIDs run in parallel.
- **Retries.** Coolify PATCH failures retry up to 3 times with backoff `1s, 4s, 16s`. After that the job is logged and dropped — Infisical may re-deliver later.
- **Recursive paths.** The server fetches secrets recursively from the configured `secretPath`; values are flattened into a single env namespace (last key wins on conflict).

## Development

Monorepo using pnpm workspaces + Turborepo. Three packages: `cli`, `server`, `shared`.

```bash
pnpm install
pnpm turbo run typecheck test build   # cached across runs
pnpm dev:cli                          # tsx + watch
pnpm dev:server                       # tsx + watch (reads .env at repo root)
```

See [`CLAUDE.md`](CLAUDE.md) for a deeper architectural tour.

Releases use [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset      # describe a change
# push, open PR; on merge to main the release workflow opens a
# "Version Packages" PR; merging it publishes the CLI to npm
# (via npm Trusted Publishing / OIDC) and pushes the server
# image to GHCR.
```

## License

ISC.
