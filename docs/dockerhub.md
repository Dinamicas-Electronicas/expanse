# Expanse — Visual Docker Compose IDE

**Design, deploy and monitor Docker Compose stacks from your browser. No YAML required.**

Expanse is a **program of Dinámicas Electrónicas** — contact:
**dinamicas.electronicas@gmail.com**.

Expanse is a self-hosted visual IDE for Docker Compose: drag services from a curated
library, connect dependencies on a canvas, and deploy the generated stack with one click.
It then shows container status, logs, metrics and an integrated terminal.

![Expanse canvas](https://raw.githubusercontent.com/Dinamicas-Electronicas/expanse/main/assets/demo1.png)

## Highlights

- **Visual canvas** (React Flow + ELK.js) with drag & drop, auto-layout and YAML import/export.
- **142 service templates** (25 multi-service stacks): databases, AI, CMS, monitoring,
  networking, messaging, automation and more.
- **One-click deploy** with port-conflict resolution, healthchecks, resource limits and
  `docker compose config` validation before execution.
- **High availability stack**: PostgreSQL primary + streaming replicas, HAProxy, PgBouncer
  and scheduled backups.
- **Live operations**: container status, logs, CPU/memory, web service viewer and xterm
  terminal.
- **Security**: RBAC and per-project ownership, Compose policy (blocks privileged mode,
  host namespaces, sensitive mounts and the Docker socket by default), optional **TOTP
  MFA**, revocable sessions, expiring/password-protected share links and an audit log.
- **Bilingual** English / Spanish UI.

## Quick start

Expanse needs a MongoDB instance and access to the Docker socket.

```bash
docker run -d \
  --name expanse \
  -p 4000:3000 \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e MONGODB_URI="mongodb://user:password@mongo:27017/expanse?authSource=admin" \
  -e URL="http://localhost:4000" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/dinamicas-electronicas/expanse:latest
```

Open `http://localhost:4000`. The first registered account becomes the administrator.

### Docker Compose with MongoDB

```yaml
services:
  app:
    image: ghcr.io/dinamicas-electronicas/expanse:latest
    ports: ["4000:3000"]
    environment:
      SECRET_KEY: ${SECRET_KEY:?set SECRET_KEY}
      MONGODB_URI: mongodb://${DB_USER:?set DB_USER}:${DB_PASS:?set DB_PASS}@db:27017/expanse?authSource=admin
      URL: http://localhost:4000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      db:
        condition: service_healthy
  db:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${DB_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${DB_PASS}
    volumes: ["expanse_db:/data/db"]
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 10s
      retries: 10
volumes:
  expanse_db:
```

## Required configuration

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT/cookie signing secret. Required. |
| `MONGODB_URI` | MongoDB connection string. Required. |
| `URL` | Public URL (`https://` enables secure cookies and HSTS). |
| `DISABLE_SIGNUP` | Set `true` after creating the admin account. |
| `ALLOW_COMPOSE_HOST_ACCESS` | Admin opt-in for host mounts in deployed stacks. |
| `ALLOW_COMPOSE_BUILD` | Admin opt-in for `build:` contexts. |
| `ALLOW_HOST_PROJECT_OPS` | Admin access to non-Expanse host resources. |
| `MFA_ENCRYPTION_KEY` | Stable key to encrypt TOTP secrets (falls back to `SECRET_KEY`). |
| `SHARE_TTL_DAYS` | Share link expiry (`30` by default, `0` = never). |

See the full list in the repository README.

## Image details

- Registries: `ghcr.io/dinamicas-electronicas/expanse` and optionally Docker Hub.
- Architectures: `linux/amd64`, `linux/arm64`.
- Tags: `latest`, `sha-*`, branch names and `vX.Y.Z` releases.
- Runtime without npm/yarn/corepack; Trivy-scanned in CI (HIGH/CRITICAL).

## Security notice

Expanse mounts `/var/run/docker.sock`, so **any authenticated account can operate the host
Docker daemon**. Treat it as an admin console:

- keep `DISABLE_SIGNUP=true` after the first account;
- use HTTPS;
- keep host mounts/builds disabled unless required;
- consider the provided `docker-compose.socket-proxy.yml` to avoid mounting the socket
  directly.

## Links

- Source, docs and issue tracker:
  https://github.com/Dinamicas-Electronicas/expanse
- Security/architecture review: `docs/SDD.md`
- Operations runbook: `docs/operations.md`

License: **MIT © 2026 Dinámicas Electrónicas**
