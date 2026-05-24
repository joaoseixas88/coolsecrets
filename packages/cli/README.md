# coolsecrets

CLI that syncs secrets from [Infisical](https://infisical.com) into a [Coolify](https://coolify.io) application's environment variables.

It reads a JSON payload from stdin (typically the output of `infisical export --format=json`) and upserts the keys into a single Coolify app you linked once. No file is ever written with your secret values — the CLI is a thin glue between the two APIs.

> Need automatic syncing on every Infisical change? The same repo ships a webhook server you can self-host via Docker (`ghcr.io/joaoseixas88/coolsecrets-server`). See the [project README](https://github.com/joaoseixas88/coolsecrets) for the server setup.

## Install

```bash
npm install -g coolsecrets
# or
pnpm add -g coolsecrets
```

Requires Node `>=20`.

## Quick start

```bash
# 1. one-time setup: paste your Coolify base URL + API token, pick the app
coolsecrets init

# 2. sync — pipe the Infisical export, the CLI upserts the envs in Coolify
infisical export --env=prod --format=json | coolsecrets sync
```

The first run of `init` writes credentials to `~/.config/coolsecrets/config.json` (mode `0600`) and a `.coolsecrets.json` in the current directory binding it to a specific Coolify application. `sync` reuses both.

Re-run `init` (or `coolsecrets --init`) inside a different project directory to link it to another Coolify app.

## Commands

### `coolsecrets init`

Interactive setup. Prompts for:

- Coolify base URL (e.g. `https://coolify.example.com`)
- Coolify API token (Bearer token from Coolify → Keys & Tokens)
- Which application in your Coolify instance this directory should sync to

Writes credentials once globally; subsequent `init` runs in other directories skip the prompts and only ask for the target application.

### `coolsecrets sync`

Reads a JSON payload from stdin and PATCHes it into the linked Coolify application as environment variables. Performs **upsert only** — keys that exist in Coolify but are not in the input are left untouched.

Two stdin payload shapes are accepted:

```json
[
  { "key": "DATABASE_URL", "value": "postgres://..." },
  { "key": "API_KEY",      "value": "secret" }
]
```

or the legacy flat object:

```json
{ "DATABASE_URL": "postgres://...", "API_KEY": "secret" }
```

The first shape is what `infisical export --format=json` produces in current versions.

### Default action

Running `coolsecrets` with no arguments behaves like `coolsecrets sync`. Running `coolsecrets --init` is equivalent to `coolsecrets init`.

## Configuration files

| Path | Purpose |
|---|---|
| `$XDG_CONFIG_HOME/coolsecrets/config.json` (or `~/.config/coolsecrets/config.json`) | Coolify base URL + API token. Shared across all projects on this machine. Mode `0600`. |
| `./.coolsecrets.json` | Binding to a specific Coolify application (`applicationId`, `applicationName`, `projectName`). One per directory. Mode `0600`. |

Both files are JSON and safe to edit by hand if needed.

## Behavior notes

- **Upsert only.** Removing a key in Infisical does not remove it in Coolify. Use the Coolify UI to drop stale keys.
- **Multi-line values** are sent with `is_multiline: true` automatically when the value contains `\n`.
- **Folder conflicts.** If your export contains the same key under multiple secret paths, the last one wins (whichever appears last in the input).
- **No subcommand TTY trap.** If you run `coolsecrets sync` without piping anything, it errors out with a clear "no stdin received" message and an example invocation.

## License

ISC. See the [project repository](https://github.com/joaoseixas88/coolsecrets) for the full source.
