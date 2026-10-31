# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## Web releases

Every push to `main` runs the production deployment workflow and automatically
increments the **minor** version (for example, `0.1.2` → `0.2.0`). The first
release is `0.1.0`. The deployed version appears in the web app footer.

For a different increment, include one marker in the pushed commit message
(the squash commit message when merging a PR):

- `[release:patch]` or `[release:bugfix]`: `0.1.2` → `0.1.3`.
- `[release:major]`: `0.1.2` → `1.0.0`.
- `[release:minor]` or no marker: `0.1.2` → `0.2.0`.

You can also run **Deploy production** manually on `main` and select
`release_type`: `minor` (default), `patch`, or `major`.

CI calculates the next version from the highest stable `vX.Y.Z` Git tag and the
root `package.json` baseline. It stamps the root package version for the build
and pushes the tag only after deployment succeeds. It does not commit version
bumps to `main`. Retrying an already tagged commit reuses its version, including
manual runs; select a new commit to create a new release. Local builds show the
root package baseline (`0.0.0`), rather than claiming a released version.
Extension (`extension-v*`) and mobile (`mobile-v*`) releases remain independent.
The workflow needs permission to write repository contents to push release tags;
repository tag rules must allow the workflow to create `v*` tags.
