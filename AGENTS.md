# Expanse Agents

## Dev Commands
- `pnpm dev` — local dev with turbopack (port 3000)
- `pnpm sync-icons` — syncs library service icons (standalone script, must run before build)
- `pnpm sanitize-library` — normalizes `logo` fields in `data/library/*.json` (run before sync-icons)
- `pnpm build` — production build (Dockerfile runs `sync-icons` automatically; local builds need it run first)
- `pnpm lint` — ESLint 9 (flat config in `eslint.config.mjs`)
- `pnpm test` — Vitest unit tests (config in `vitest.config.mts`, tests in `tests/`)
- `pnpm test:docker` — runs the Docker template config/smoke integration test
- `pnpm audit` — fails on high/critical advisories (`pnpm audit --audit-level=high`)
- `pnpm smoke` — smoke test against a running instance (containers, routes, APIs, headers)
- Audit report and threat model: `docs/SDD.md`

## Security Model
- Server Actions are public endpoints: **never** export a privileged helper from a `'use server'` module. OAuth identity handling lives in `lib/oauth.ts` (not an action).
- Every action must call `ensureAuth()`; every per-user query must filter by `userId` (compose, share, HA).
- Use `lib/validation.ts` schemas at the server boundary; never trust client validation or client flags.
- Sessions: `lib/session.ts` sets `HttpOnly`, `SameSite=Lax` and `Secure` when `URL` is HTTPS.
- Rate limit auth endpoints with `lib/rateLimit.ts` (in-memory: single instance only).
- Docker execution goes through `lib/dockerExec.ts` (`execFile`, validated ids). The container still has full Docker socket access: treat any authenticated account as host admin.
- Indexes/TTL are created by `lib/dbIndexes.ts` from `instrumentation.ts`.

## Environment Setup
- Requires `SECRET_KEY` env var (middleware redirect loop if missing)
- Requires MongoDB at `MONGODB_URI` (default: `mongodb://localhost:27017`)
- Requires Docker socket at `/var/run/docker.sock` (app runs as root or needs docker group)
- `CORE_ONLY=true` skips analytics/telemetry
- `DISABLE_TELEMETRY` disables both PostHog and external telemetry script
- `.env` file is NOT used — all config via environment variables or `docker compose`

## Package Manager
- **pnpm 12** (not npm/yarn) — pinned via `packageManager` and the Dockerfile `PNPM_VERSION` arg
- Project settings live in `pnpm-workspace.yaml` (pnpm >=11 ignores the `pnpm` field in `package.json`):
  - `overrides` — security pins for transitive dependencies
  - `patchedDependencies` — `expanse-docker-lib` patch (reinstall after changing `patches/expanse-docker-lib.patch`)
  - `allowBuilds` — replaces pnpm 10's `onlyBuiltDependencies`
- Run `pnpm audit` before releases; the goal is zero advisories at any severity

## Build Notes
- `next.config.mjs` has `ignoreBuildErrors: true` and `ignoreDuringBuilds: true` — ESLint/type errors do not block builds
- Standalone output mode (`output: 'standalone'`) — server.js is the entrypoint
- Run `pnpm sync-icons` before `pnpm build` locally; Dockerfile runs it automatically
- Test config: `vitest.config.mts` uses jsdom, `tests/setup.ts`, tests in `tests/**/*.test.{ts,tsx}`
- The Docker template test (`tests/integration/dockerTemplates.integration.test.ts`) renders every
  `data/library/*.json` into a compose file and validates it with the real `docker compose config`
- Helper scripts in `scripts/`: `sync-icons.mjs`, `sanitize-library.mjs`

## Architecture
- **State**: 9 Zustand stores in `store/` — `compose.ts` is central (auto-saves with 2s debounce)
- **Canvas**: React Flow (`@xyflow/react`) + ELK.js layout — node-based Docker Compose editor in `components/playground/`
- **Docker bridge**: Server Actions in `actions/` wrap `docker compose` CLI through `lib/dockerExec.ts`
  (`execFile` + argument arrays, never shell string interpolation). IDs are validated with
  `assertComposeId()` (24-char ObjectId) and `assertDockerReference()`
- **Auth**: JWT (HS256 via `jose`) in HTTP-only cookie, 30-day expiry. Edge middleware enforces. `lib/auth.ts` `ensureAuth()` guards all server actions
- **Database**: MongoDB via mongoose — schemaless collections: `users`, `composes`, `shares`, `reset_code`
- **Service library**: 138 JSON templates in `data/library/` — each follows `TemplateService` interface in `types/library.ts`
- **Compose library**: `expanse-docker-lib` provides `Compose`, `Service`, `Translator` classes (NOT i18n — translates between compose object formats)
- **i18n**: `next-intl` with `[locale]` route segments (see i18n section below)

## Key Routes
All page routes are under `app/[locale]/` (e.g., `/en/dashboard`, `/es/login`):

| Route | Purpose |
|---|---|
| `/[locale]` | Home — lists user's compose projects |
| `/[locale]/dashboard` | Same as home, in UnifiedLayout sidebar |
| `/[locale]/dashboard/playground?id=` | Visual Docker Compose canvas editor |
| `/[locale]/dashboard/settings` | Account settings, nodes, backup |
| `/[locale]/deploy/settings` | System-level Docker management |
| `/[locale]/login` / `/[locale]/signin` | Auth pages |
| `/[locale]/login/cli` | CLI token auth |
| `/[locale]/share?id=&name=` | Read-only shared compose view |

Static routes outside `[locale]`: `app/api/`, `app/robots.ts`, `app/sitemap.ts`

## i18n (next-intl)

### Infrastructure
- **Library**: `next-intl` (App Router-compatible)
- **Config**: `i18n/routing.ts` (locales: `en`, `es`; default: `en`), `i18n/request.ts`
- **Messages**: `messages/en.json`, `messages/es.json` — nested JSON catalogs by namespace
- **Middleware**: `middleware.ts` chains `next-intl` middleware (locale detection/redirect) with existing auth middleware
- **Root layout** (`app/layout.tsx`): minimal — html/body only, no `<html lang>` or providers
- **Locale layout** (`app/[locale]/layout.tsx`): sets `<html lang={locale}>`, wraps children with `NextIntlClientProvider`
- **Routing**: All `<Link>` imports MUST use `next-intl/link` (auto-prepends locale prefix)

### Translation Patterns
- **Client components**: `const t = useTranslations('namespace')` then `t('key')`
- **Server components**: `const t = await getTranslations('namespace')` then `t('key')`
- **Rich text (links)**: `t.rich('acceptTerms', { terms: (chunks) => <Link href="/terms">{chunks}</Link> })`
- **Interpolation**: `t('remoteNodeAdded', { host: remoteHost })`
- **Locale switcher**: `<LocaleSwitcher />` component in `components/ui/localeSwitcher.tsx`

### Namespaces in messages/
`common`, `nav`, `home`, `auth`, `forgotPassword`, `settings`, `deploy`, `monitor`, `library`, `execution`, `terminal`, `terms`

### When Adding New Strings
1. Add key to both `messages/en.json` and `messages/es.json`
2. Use `useTranslations('namespace')` in client components, `getTranslations('namespace')` in server components
3. Import `Link` from `next-intl/link` (not `next/link`) in all locale-scoped pages

## Docker Deploy Flow
1. User creates compose on canvas → `store/compose.ts` auto-saves to MongoDB
2. Deploy validates ports via `validateComposePorts()` → auto-reassigns collisions (up to 5 retries)
3. `dockerActions.ts` writes YAML to `/tmp/expanse-{id}/docker-compose.yaml`
4. Patches YAML (`lib/dockerCompose.ts`): normalizes service/network/volume keys, injects DB healthchecks,
   `service_healthy` conditions and resource limits from metadata
5. Runs `docker compose up -d` with project name `expanse-project_<objectId>`

## Known Quirks
- App runs as root inside container (docker group access needed)
- Docker socket mount required: `/var/run/docker.sock:/var/run/docker.sock`
- `middleware.ts` redirects unauthenticated users to `/{locale}` (not `/login`)
- Build-time `ensureAuth()` returns a stub user via `npm_lifecycle_event === 'build'` check
- Font config only loads Latin subset (`DM_Sans({ subsets: ['latin'] })`) — sufficient for English and Spanish
- `store/compose.ts` `disabled` store defaults to `true` — auto-save is OFF until explicitly enabled
- `expanse-docker-lib`'s `Translator` class is NOT related to i18n — it converts between Docker Compose object formats
- Server actions need `getTranslations()` (not `useTranslations()`) since they run server-side
- The `?data=` URL param on login/playground routes carries base64url-encoded compose data — locale prefix doesn't break this flow
- `data/library/*.json` `description` fields are a mix of English and some Spanish — not yet translated via i18n keys
- Compose keys must match `[a-zA-Z0-9._-]+`. Use `sanitizeDockerName()` from `lib/dockerCompose.ts` whenever a
  service, network or volume name is derived from a template name or user input. Skipping it breaks stacks whose
  names contain parentheses (e.g. `WordPress (Full Stack)` produced `wordpress(fullstack)_net`:
  `networks additional properties ... not allowed`)

## Adding Service Templates
Create `data/library/<service-name>.json` following the schema in `types/library.ts`. Categories: Database, Web, Network, etc. Stack templates (multi-container) have `isStack: true` and `related_services`; stack names may contain spaces/parentheses because keys are sanitized before deployment.

Run `pnpm test` (and `pnpm test:docker` when Docker is available) after adding a template: the integration test
validates every template against the real Compose CLI.

## CI/CD
- Push to `main`: builds multi-arch (amd64+arm64) image, pushes to Docker Hub
- Push to other branches: build-only test (no push) — `test-build.yml` runs Docker build test
- Tag push `v*`: creates GitHub Release with multi-arch image

## HA Deployments
When deploying, users are prompted with `HaDeploymentDialog` to choose HA options:
- **HA Enabled**: Multiple replicas with autoscaling (min 2, max 10)
- **Load Balancer**: HAProxy with round-robin, health checks
- **Connection Pooling**: PgBouncer in transaction mode

Template HA fields in `types/library.ts`:
- `haEnabled`: boolean to mark template as HA-capable
- `loadBalancer`: { type, port, targetPort, algorithm, healthCheckPath }
- `replicas`: { enabled, minReplicas, maxReplicas, scaleTarget }
- `databaseHa`: { type, poolMode, maxConnections, poolSize }

Key files for HA:
- `lib/metadata.ts`: `generateHaproxyConfig()`, `generatePgbouncerConfig()`
- `actions/dockerActions.ts`: `runCompose()` accepts `haConfig` parameter
- `components/playground/haDeploymentDialog.tsx`: User prompt for HA options
- `components/playground/haMetricsPanel.tsx`: Shows HA metrics during execution
- `data/library/postgrest-ha.json`: Example HA template