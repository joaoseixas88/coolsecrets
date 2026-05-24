# Changesets

Hello and welcome! This folder contains the [changesets](https://github.com/changesets/changesets) that drive releases of `coolsecrets` (the CLI) and the `coolsecrets-server` Docker image.

## How

For any change that should ship a new version, run:

```bash
pnpm changeset
```

Pick which package(s) the change affects, the bump type (patch/minor/major), and write a one-line summary. The CLI publishes to npm; the server publishes as a Docker image to GHCR. The `@coolsecrets/shared` package is private and bundled into the CLI — it never needs a changeset.

When changesets are merged to `main`, the release workflow opens a "Version Packages" PR. Merging that PR triggers the actual publish.
