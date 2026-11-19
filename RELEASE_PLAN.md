# Release Plan

## P0 - Release Gate

- Keep `pnpm-lock.yaml` committed and require `pnpm install --frozen-lockfile` in CI.
- Require `SECRET_KEY`, `DB_USER` and `DB_PASS`; never use development fallbacks in production.
- Run `typecheck`, ESLint, unit/integration tests and Docker build before merge.
- Verify app and MongoDB healthchecks in a clean environment.
- Review the worktree and stage only the intended application changes.

## P1 - Runtime Reliability

- Replace ad-hoc console output with structured, redacted logs.
- Add log retention and a documented collection command for Docker deployments.
- Add startup validation for URL, database and secret configuration.
- Keep Docker smoke tests isolated and remove test-owned resources automatically.

## P2 - Security

- Remove direct Docker socket access from the web process, or isolate it behind a narrowly scoped proxy.
- Stop running the application container as `root` where the Docker execution architecture permits.
- Rotate any credentials that have appeared in local files or logs.
- Add dependency and image vulnerability scans to CI.

## P3 - Quality

- Resolve remaining ESLint warnings, especially effect dependencies.
- Complete the all-template startup matrix in a dedicated runner with per-template timeouts.
- Add E2E coverage for authentication, compose deployment, sharing and HA flows.
- Separate unrelated documentation changes before commit.

## Exit Criteria

- `pnpm install --frozen-lockfile` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm lint` has no errors.
- Unit/integration tests pass with Docker smoke tests enabled.
- A clean Docker build and healthcheck pass.
- No secrets are staged and the release diff has been reviewed.
