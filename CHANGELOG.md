# Changelog

All notable changes to Expanse are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — Security & compatibility maintenance

### Fixed

- **Stacks with special characters in their name could not be deployed.**
  A stack such as `WordPress (Full Stack)` produced the network key
  `wordpress(fullstack)_net`, which Compose rejects with
  `networks additional properties '...' not allowed`. Service, network and
  volume keys are now normalized with `sanitizeDockerName()` before the YAML is
  written, and `patchComposeYaml()` re-normalizes imported documents while
  keeping `depends_on`, `links`, `extends`, `network_mode` and volume mounts in
  sync.
- Volume names typed in the volume wizard are sanitized at creation time.
- `docker compose logs/ps/stop/up` calls no longer depend on shell quoting:
  they run through `execFile` with argument arrays.

### Security

- **Dependency audit is clean (`pnpm audit` reports no advisories).**
  - `next` 15.5.21 → 15.5.29 (critical RCE/DoS advisories)
  - `axios` 1.19 → 1.21.1, `mongoose` 8.24.3 → 8.24.10,
    `sharp` 0.35.3 → 0.35.5, `vitest` 4.1.8 → 4.1.12,
    `zod` 3.25 → 4.6.7 (memory-exhaustion advisory)
  - Overrides for transitive packages: `dompurify`, `undici`,
    `brace-expansion`, `minimatch`, `js-yaml`, `fflate`, `source-map-js`,
    `follow-redirects`, `postcss`, `postcss-selector-parser`, `vite`
- **Removed shell command injection** in server actions. Compose IDs are
  validated as 24-char ObjectIds (`assertComposeId`) and container/volume/network
  references as safe Docker identifiers (`assertDockerReference`) before use.
- Docker runtime image now installs `docker-cli-buildx` (removes the
  “Docker Compose requires buildx plugin” warning and supports
  `docker compose up --build`).

### Changed

- pnpm 12: project settings (`overrides`, `patchedDependencies`,
  `allowBuilds`) moved to `pnpm-workspace.yaml`. The Dockerfile pins the same
  pnpm version and installs with `--frozen-lockfile`.
- ESLint 8 → 9 with a flat config (`eslint.config.mjs`); `.eslintrc.json` and
  `.eslintignore` removed. `pnpm lint` is clean (warnings only).
- Vitest config renamed to `vitest.config.mts` (Vite ESM loader warning).
- `docker-compose.yml`: removed the deprecated `pull_policy`, mounted
  `data/library` read-only, persisted PNG exports in `expanse_exports`,
  added `stop_grace_period` and logging rotation.
- CI: new `.github/workflows/ci.yml` runs lint, typecheck, tests and
  `pnpm audit --audit-level=high` on every push and pull request.

### Tests

- New `tests/lib/dockerCompose.test.ts` and `tests/lib/dockerExec.test.ts`
  (name normalization, reference validation, injection attempts).
- `tests/integration/dockerCompose.integration.test.ts` now validates the
  generated YAML with the real `docker compose config` CLI.
- `tests/integration/dockerTemplates.integration.test.ts` renders stacks with
  their network definitions (the case that used to break) and no longer prunes
  Docker images as a side effect of the config-only test.
