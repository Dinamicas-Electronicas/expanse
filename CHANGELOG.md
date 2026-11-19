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

### Documentation & attribution

- README rewritten for the `Dinamicas-Electronicas/expanse` repository:
  corrected clone/image URLs, added index, screenshots and authorship section.
- Added `CONTRIBUTING.md` and `NOTICE`.
- Every source file now carries the Dinámicas Electrónicas copyright header.
  `pnpm license:headers` applies it (idempotent) and `pnpm license:check`
  verifies it in CI and before a release.
- `LICENSE`, `package.json` (`author`, `license`, `repository`) and the
  copyright notice were updated to Dinámicas Electrónicas
  <dinamicas.electronicas@gmail.com>.

## [Unreleased] — Audit: usability, stability and security

See `docs/SDD.md` for the full report, threat model and roadmap.

### Security (critical)

- Fixed an **account takeover** in the `createOrLoginUser` Server Action:
  a client-supplied `external` flag skipped password verification. OAuth now
  uses `lib/oauth.ts`, which is not a Server Action.
- Fixed **unauthenticated access to any compose** through `getComposeByIdPublic`
  (it exposed services and environment secrets). It now requires a session and
  ownership.
- Enforced **server-side registration validation** (email, 8–100 char password,
  accepted terms) and added rate limiting to login, signup, password reset,
  API token and the CLI Basic-Auth endpoint.
- Session cookies now set `SameSite=Lax` and `Secure` automatically when `URL`
  is HTTPS (`lib/session.ts`).
- Fixed IDOR in `shareCompose` and in every HA action (failover, backup,
  restore, pool metrics/config): all queries are scoped by `userId`.
- Added `ensureAuth()` to `getLocalSystemInfo` / `saveRemoteNodeConfig` (they
  were callable anonymously).
- Removed secrets from logs (GitHub OAuth token, password-reset URL/code).
- Fixed a middleware bypass through unsupported locales (`/fr/dashboard`):
  locales are validated and `/deploy` is now protected.
- Added security headers (nosniff, frame options, referrer policy,
  permissions policy, COOP, conditional HSTS).
- Hardened `/api/export/png` (wrong database, ObjectId validation, public
  shares only, generic errors), `/api/compose` (400 on invalid ids) and the
  logos API (allowlist + path containment).
- Added MongoDB indexes: unique `users.email`, `composes.userId`,
  `shares.*`, plus TTL indexes for `reset_code` and `csrf_token`.

### Usability

- Fixed the dashboard crash (`ReferenceError`/TDZ) that redirected users with
  projects to `/login`.
- Fixed the Save button showing the sign-up dialog to already authenticated
  users; the playground now detects the session and enables saving/auto-save.
- Added localized `error.tsx` / `not-found.tsx`, and a proper "shared project
  not found" state without leaking internal error messages.
- Terms acceptance is now enforced in the embedded sign-up form.

### Stability

- Debounced saves capture the project id and are cancelled when switching
  projects, preventing cross-project overwrites.
- Server Action body limit raised to 4 MB so saves with large canvas
  screenshots no longer fail.
- `generateHAComposeAction` reads `doc.data` instead of the non-existent
  `doc.compose`.
- Idempotent index bootstrap at startup (TTL cleanup included).

### Tests

- `tests/actions/auth.test.ts` (account-takeover regression),
  `tests/lib/session.test.ts`, `tests/lib/rateLimit.test.ts`,
  `tests/lib/validation.test.ts`.
