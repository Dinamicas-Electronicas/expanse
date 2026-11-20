# Changelog

All notable changes to Expanse are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased] — Security & compatibility maintenance

### Security & operations (P2 cycle)

- **MFA (TOTP):** users can enable a second factor from Settings → Account.
  Secrets are encrypted at rest with AES-256-GCM (`MFA_ENCRYPTION_KEY`, falling
  back to `SECRET_KEY`). The code is required by web login, the embedded
  playground login, the CLI token endpoint and `/api/auth/jwt` (via `X-OTP`).
  Password reset clears MFA to avoid permanent lockout.
- **Password-protected shares:** sharing accepts an optional password (bcrypt).
  Visitors unlock it from the share page; a signed 1-hour cookie is verified by
  the share loader, `/api/compose` and `/api/export/png`. Password hashes are
  never returned by `getAllMyShares`.
- **Audit log:** sensitive operations (login, register, password reset, account
  deletion, deploy/stop/restart, project/container/volume removal, terminal
  execution, HA failover/backup/restore, share creation) are appended to
  `audit_log` with a 90-day TTL. Events never include secrets or command text.
- **Sign out everywhere:** new `logoutEverywhere` action bumps `sessionVersion`
  and revokes every JWT; exposed in Settings → Account.
- **Share expiry:** links now expire after `SHARE_TTL_DAYS` (default 30; `0` =
  never). Expired shares are rejected by the share page, `/api/compose` and
  `/api/export/png`; re-sharing refreshes the expiry.
- **Retention:** a daily maintenance job removes PNG exports older than
  `EXPORT_RETENTION_DAYS` (7) and `/tmp/expanse-*` directories older than
  `TMP_RETENTION_DAYS` (7).
- New env vars documented: `SHARE_TTL_DAYS`, `EXPORT_RETENTION_DAYS`,
  `TMP_RETENTION_DAYS`.
- **Quotas and size limits:** `MAX_COMPOSES_PER_USER` (50), `MAX_SERVICES_PER_COMPOSE`
  (50), `MAX_COMPOSE_BYTES` (1 MB) and `MAX_SCREENSHOT_CHARS` (4 MB). Oversized
  screenshots are skipped without failing the save.
- **Resource limits:** the reference compose caps the app (`APP_CPUS`/`APP_MEM_LIMIT`,
  2 CPU/2 GB) and MongoDB (`DB_CPUS`/`DB_MEM_LIMIT`, 1 CPU/1 GB).
- **Operations runbook:** new `docs/operations.md` with `mongodump`/`mongorestore`,
  retention, migrations (`email` lowercase, `sessionVersion`, legacy shares), secret
  rotation and incident response.
- **Socket proxy example:** `docker-compose.socket-proxy.yml` runs Docker through
  `tecnativa/docker-socket-proxy` (no direct socket mount in the app).

### CI/CD

- `docker-image.yml` publishes to **GHCR** with `GITHUB_TOKEN`
  (`packages: write`), so no extra secrets are required. Docker Hub remains
  optional via `DOCKER_USERNAME`/`DOCKER_PASSWORD`.
- Multi-arch (`linux/amd64`, `linux/arm64`) images with metadata tags
  (`latest`, branch, `sha-*`, semver), SBOM/provenance and GHA layer cache.
  Pull requests build `amd64` only and never push.
- `release.yml` publishes GHCR/Docker Hub images for `v*` tags and creates the
  GitHub Release; also runnable manually with a tag input.
- `test-build.yml` builds non-main branches with Buildx cache and no push.
- **Email migration:** `pnpm migrate:emails` normalizes legacy `users.email` values
  (dry-run by default, refuses collisions before writing).

### Stability & performance (P1 cycle)

- **Optimistic concurrency on save:** `registerCompose` accepts the
  `updatedAt` the client read and returns `409`/`SAVE_CONFLICT` instead of
  silently overwriting another tab. The playground shows `Unsaved / Saving /
  Saved HH:MM`.
- **Reliable close save:** `beforeunload` uses `navigator.sendBeacon` against
  `POST /api/compose/save` (cookie-authenticated) instead of an async Server
  Action that the browser can cancel.
- **Mongo fail-fast:** `serverSelectionTimeoutMS`/`connectTimeoutMS` set to 5 s
  and `socketTimeoutMS` to 60 s. New `GET /api/ready` checks MongoDB and the
  Docker daemon; the compose healthcheck uses it.
- **Deploy lock:** `runCompose`/`restartCompose` reject a second concurrent
  operation on the same project (`DEPLOY_IN_PROGRESS`).
- **Docker timeouts per operation:** quick calls default to 60 s, status/logs/
  stats/config to 15 s, and compose up/down keep the long 30 min budget (the
  `timeout: undefined` override that disabled the default is fixed).
- **Polling:** pause when the tab is hidden, 5 s while executing / 20 s idle,
  and derive `isExecuting` from Docker (crashed stacks no longer stay in
  “Stop” mode). `ProjectMonitor` only polls running projects.
- **Port validation:** parses `IP:host:container`, `/udp` and object ports,
  keeps a reservation set across services and no longer returns duplicate
  host ports. New `lib/ports.ts` + tests.
- **Root layout:** a single `<html>/<body>` in `app/[locale]/layout.tsx`
  (next-intl pattern); removed the nested document and unused Geist fonts.
- Removed the unreachable `playground/export-render` route, `lib/exportToken`,
  the duplicate `actions/exportActions.ts`, unused `searchDockerHub` and
  `exportPlaygroundAsPNGToFile`.
- UI stubs (Google Drive, remote Docker nodes) are disabled and labelled
  “Coming soon”; sharing warns that the public YAML contains environment
  variables. Added `aria-label` to icon-only controls.
- **Accessibility:** `prefers-reduced-motion` is respected globally; the save
  status is an `aria-live` region and icon-only account/terminal controls have
  accessible names.

### Security (P0 cycle)

- Added per-resource authorization: every Docker action now loads the compose
  with `{ _id, userId }` (`lib/authorization.ts`); the project id is no longer
  a capability.
- Added RBAC: the first user is `admin` (claimed atomically in
  `lib/users.ts`), host-wide operations require that role, and non-Expanse
  projects/containers require `ALLOW_HOST_PROJECT_OPS=true`.
- Added `lib/composePolicy.ts`: deployed YAML is rejected when it uses
  `privileged`, `cap_add`, `devices`, `pid/ipc/uts`, `network_mode: host`,
  sensitive bind mounts or the Docker socket. `build:` and host mounts are
  opt-in (`ALLOW_COMPOSE_BUILD`, `ALLOW_COMPOSE_HOST_ACCESS`). Every deploy now
  runs `docker compose config --quiet` before touching the daemon.
- Closed the registration bypass: `createOrLoginUser` is login-only;
  `registerUser` and OAuth respect `DISABLE_SIGNUP`, terms and rate limits.
- `sessionVersion` is part of the JWT and checked on every action; password
  reset invalidates existing sessions. Reset codes now use CSPRNG.
- `/api/auth/jwt` has rate limiting, normalizes emails, handles `:` in
  passwords and guards passwordless accounts.
- Account deletion now requires the password on the server, deletes projects,
  shares and reset codes, and no longer redirects to an external form.
- Third-party telemetry is opt-in (`ENABLE_EXTERNAL_TELEMETRY`), the version
  check points to `Dinamicas-Electronicas/expanse`, and a CSP header is sent.

### Fixed (P0 cycle)

- Home no longer inspects the `HttpOnly` cookie with `document.cookie`; the
  project list is shown for authenticated users and logout calls the action.
- HA configuration is persisted (`haConfig`/`haEnabled`) and reused by restart;
  the generator produces a runnable non-swarm stack (bridge network, Bitnami
  Postgres replicas, TCP HAProxy, PgBouncer, backup) validated with the real
  Compose CLI. HA status is matched by `docker compose ps` `Service`.
- Destructive actions ask for confirmation; "New project" no longer discards
  changes on Cancel.
- Image references are parsed correctly (`registry:5000/app`, digests).
- Fixed `/api/compose/machine` for Compose files without volumes/networks.
- Share revalidation points to `/dashboard/deploys`; resetCompose clears the
  previous project's HA polling.

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

### Repository cleanup

- Removed obsolete planning documents (`PLAN.md`, `TESTING_PLAN.md`,
  `RELEASE_PLAN.md`) whose content is already delivered or superseded by the
  shipped code, `docs/SDD.md` and `PRODUCT_ROADMAP.md`.
- Removed dead code: the upstream `/[locale]/debug` page, unused UI stubs
  (`fisrtCompose`, `betaBanner`, `betaWarning`, `coreBanner`, `avatar`, `form`,
  `feature`, `navigation-menu`), the `HATemplateSelector` and playground
  components that were never mounted (`shareButton`, `integrateGitHubButton`,
  `createIssueModal`, `logoBackground`), the unused HA panels/nodes/hooks and
  the compatibility stubs `lib/safe-action.ts`, `lib/library_data.ts`,
  `lib/config.ts` and `lib/models/user.ts`.
- Removed duplicated/unused assets (`assets/expanselab.png`, `assets/nagios.png`,
  `assets/traefik.png`), the legacy `public/terms/index.html` and
  `public/cgu.pdf`.
- README rewritten from the current codebase (142 templates, real routes, env
  vars, architecture, deploy flow and commands).

### Documentation & attribution

- `docs/SDD.md` reescrito como revisión integral (ciclo 2): 57 hallazgos
  (2 críticos, 13 altos, 24 medios, 18 bajos) con evidencia `archivo:línea`,
  diseño de corrección, matriz de autorización, plan P0/P1/P2 y plan de pruebas.
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
