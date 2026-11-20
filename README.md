<div align="center">

  <img src="assets/expanse.png" alt="Expanse" width="150" />

  <h1>Expanse</h1>

  <p><strong>El IDE visual para Docker Compose</strong></p>

  <p>Diseña tu infraestructura en un canvas, despliégala con un clic y monitorea<br/>
  contenedores, logs y métricas en tiempo real. Sin escribir YAML a mano.</p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-blue.svg" alt="Licencia: MIT" /></a>
    <a href="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/ci.yml"><img src="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/docker-image.yml"><img src="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/docker-image.yml/badge.svg" alt="Docker Image" /></a>
    <a href="https://github.com/Dinamicas-Electronicas/expanse/pkgs/container/expanse"><img src="https://img.shields.io/badge/GHCR-expanse-2496ED?logo=github" alt="GHCR" /></a>
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/idiomas-ES%20%7C%20EN-9F7AEA" alt="Idiomas: Español e Inglés" />
  </p>

  <p>
    <strong>Expanse es un programa de Dinámicas Electrónicas</strong><br/>
    Contacto: <a href="mailto:dinamicas.electronicas@gmail.com">dinamicas.electronicas@gmail.com</a>
  </p>

  <img src="assets/demo1.png" alt="Expanse — Editor visual de Docker Compose" width="100%" />

</div>

---

## 📑 Índice

- [¿Qué es Expanse?](#-qué-es-expanse)
- [Características](#-características)
- [Inicio rápido](#-inicio-rápido)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Rutas y APIs](#-rutas-y-apis)
- [Arquitectura](#-arquitectura)
- [Biblioteca de servicios](#-biblioteca-de-servicios)
- [Imagen Docker](#-imagen-docker)
- [Desarrollo y tests](#-desarrollo-y-tests)
- [Seguridad y límites](#-seguridad-y-límites)
- [CI/CD](#-cicd)
- [Operación](#-operación)
- [Contribuir](#-contribuir)
- [Autoría y licencia](#-autoría-y-licencia)
- [Roadmap](#-roadmap)

---

## 🎯 ¿Qué es Expanse?

**Expanse** es una aplicación web autoalojada que convierte `docker-compose.yml` en un
diagrama editable. Arrastra servicios desde una biblioteca de plantillas, conéctalos,
configura puertos, volúmenes, variables de entorno y despliega el stack completo contra el
Docker Engine local, todo desde el navegador.

| Segmento | Beneficio principal |
|----------|---------------------|
| **DevOps / SRE** | Prototipar arquitecturas y validar Compose sin editar YAML |
| **Startups** | Levantar stacks completos (DB + backend + frontend) en minutos |
| **Desarrolladores** | Gestión visual de contenedores sin memorizar la CLI de Docker |
| **Equipos** | Compartir proyectos y diagramas con enlaces de solo lectura |
| **Homelab / self-hosting** | Catálogo curado de servicios listos para desplegar |

> Expanse **no** sustituye a Docker: genera Compose válido y ejecuta `docker compose`
> mediante `execFile` con argumentos validados.

---

## ✨ Características

### 🖼️ Canvas visual (React Flow + ELK.js)

- Drag & drop de servicios, redes, volúmenes, bindings, variables y etiquetas.
- Conexiones que se traducen en `depends_on`, redes y volúmenes del Compose.
- Auto-layout jerárquico con ELK.js (routers → aplicaciones → bases de datos).
- Editor lateral por tipo de nodo; editor YAML con **Monaco** para retoques manuales.
- Importación/exportación de `docker-compose.yml` conservando la disposición.
- Guardado automático con control de versión (`SAVE_CONFLICT` si otra pestaña guardó).

### 📦 Biblioteca de 142 plantillas (25 stacks)

| Categoría | Plantillas | Ejemplos |
|-----------|-----------:|----------|
| **Database** | 19 | PostgreSQL, MySQL, MongoDB, Redis, Cassandra, ClickHouse |
| **AI** | 18 | Ollama, Open WebUI, Qdrant, AnythingLLM, ComfyUI, vLLM |
| **Cloud** | 15 | Nextcloud, Seafile, OwnCloud, Cloudreve, Syncthing |
| **Network** | 14 | Nginx Proxy Manager, Traefik, WireGuard, NetBird, Pi-hole |
| **CMS** | 14 | WordPress, Ghost, Strapi, Directus, Drupal, Joomla |
| **Social** | 12 | Mastodon, Pixelfed, Pleroma, Akkoma, Friendica |
| **Monitoring** | 11 | Prometheus, Grafana, Zabbix, Netdata, Uptime Kuma |
| **Automation** | 10 | n8n, Node-RED, Apache Airflow, Activepieces, Windmill |
| **Development** | 9 | Gitea, Appwrite, Elixir, Go, Node.js, PHP, Python, Ruby, Rust |
| **Messaging** | 9 | Rocket.Chat, Zulip, Mattermost, Matrix, Prosody |
| **OS** | 6 | Alpine, Debian, Ubuntu, Fedora, Rocky Linux, Amazon Linux |
| **Otros** | 5 | Nginx, PostgREST HA, Portainer, Vaultwarden, Media Center |

### 🚀 Despliegue

- Validación previa de puertos y reasignación automática (hasta 5 reintentos).
- Generación de YAML en `/tmp/expanse-<id>/docker-compose.yaml` con proyecto
  `expanse-project_<objectId>`.
- Normalización de nombres, healthchecks de bases de datos, `service_healthy` y límites
  de CPU/memoria.
- `docker compose config --quiet` antes de tocar el daemon y **lock por proyecto** para
  evitar despliegues concurrentes.
- Compose y binds relativos viven en `EXPANSE_WORK_DIR` (volumen `expanse_work`), con
  permisos `0700` y YAML/config `0600`; en ejecución directa se usa `/tmp`.
- Arrancar, parar, reiniciar, logs, estado y eliminación por proyecto.

### 🔄 Alta disponibilidad

- Stack HA generado: PostgreSQL primario + réplicas streaming, **HAProxy**, **PgBouncer**
  y backup programado.
- Configuración persistida (`haConfig`/`haEnabled`) y reutilizada al reiniciar.
- Probado con `docker compose up`: replicación real, consultas por HAProxy y PgBouncer,
  backup en volumen y estado por servicio.
- Limitación conocida: no reconecta automáticamente los servicios existentes al proxy ni
  migra los datos del Postgres original.

### 📊 Monitoreo y operación

- Estado por servicio, CPU/memoria, logs en streaming y terminal **xterm.js**.
- Visor web de servicios HTTP, panel de proyectos/contenedores/volúmenes/imágenes.
- Búsqueda y *pull* de imágenes desde Docker Hub.
- Polling con pausa en pestaña oculta y sin backoff agresivo.

### 🔐 Seguridad y colaboración

- **RBAC** (primer usuario `admin`) y ownership por proyecto en cada acción.
- **Política de Compose**: bloquea `privileged`, `cap_add`, `devices`, namespaces host,
  rutas sensibles y el socket Docker; `build:` y montajes de host requieren opt-in admin.
- **MFA TOTP** opcional con secreto cifrado AES-256-GCM.
- **Sesiones revocables** (`sessionVersion`, “cerrar sesión en todos los dispositivos”).
- **Shares** con caducidad (`SHARE_TTL_DAYS`) y contraseña opcional.
- **Auditoría** (`audit_log`, TTL 90 días) de login, deploys, borrados, terminal y HA.
- **Cuotas**: máximo de proyectos/servicios, tamaño de Compose/screenshot.
- **Compose de referencia** con límites de CPU/memoria y override de socket proxy.

### 🌐 i18n y accesibilidad

- **English** (por defecto) y **Español** con `next-intl` y rutas `/{locale}`.
- `prefers-reduced-motion`, `aria-live` en el estado de guardado y nombres accesibles en
  controles solo-icono (cobertura axe completa pendiente).

---

## 🚀 Inicio rápido

### Requisitos

- Docker Engine 20.10+ con Compose v2 y el plugin `buildx`.
- 4 GB de RAM recomendados.
- Puerto `4000` libre.
- pnpm 12 solo para desarrollo o generación de secretos.

### Imagen publicada (recomendado)

```bash
docker pull ghcr.io/dinamicas-electronicas/expanse:latest
```

```bash
docker run -d \
  --name expanse \
  -p 4000:3000 \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e MONGODB_URI="mongodb://usuario:password@host:27017/expanse?authSource=admin" \
  -e URL="http://localhost:4000" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/dinamicas-electronicas/expanse:latest
```

> GHCR usa `GITHUB_TOKEN` en CI y no requiere secretos adicionales. Docker Hub es
> opcional (`DOCKER_USERNAME`/`DOCKER_PASSWORD`). Si el paquete está privado, cámbialo a
> público en **Packages** o haz `docker login ghcr.io`.

### Docker Compose (con MongoDB incluido)

```bash
git clone https://github.com/Dinamicas-Electronicas/expanse.git
cd expanse

pnpm generate-secrets   # crea .env con SECRET_KEY/DB_USER/DB_PASS
docker compose up -d --build
```

Abre <http://localhost:4000>. `pnpm generate-secrets` requiere pnpm; si no lo tienes,
crea `.env` a mano usando `.env.example`.

> `SECRET_KEY`, `DB_USER` y `DB_PASS` son obligatorios: `docker compose` falla
> explícitamente si faltan.

### Verificación

```bash
pnpm smoke              # contenedores, rutas, APIs y cabeceras
curl localhost:4000/api/ready
```

---

## ⚙️ Configuración

Toda la configuración se pasa por entorno (no se usa `.env` en runtime salvo
`docker compose`).

| Variable | Obligatoria | Descripción |
|----------|:-----------:|-------------|
| `SECRET_KEY` | ✅ | Firma JWT y cookies. Sin ella el middleware responde 500. |
| `MONGODB_URI` | ✅ | Conexión MongoDB (por defecto `mongodb://localhost:27017`). |
| `URL` | Recomendada | URL pública; si es `https://` activa `Secure` y HSTS. |
| `APP_URL` | Solo Compose | URL usada por `docker-compose.yml`. |
| `DB_USER` / `DB_PASS` | Solo Compose | Credenciales del MongoDB del stack. |
| `CORE_ONLY` | No | Desactiva SEO/marketing/OAuth. |
| `DISABLE_TELEMETRY` | No | Desactiva PostHog/telemetría. |
| `ENABLE_EXTERNAL_TELEMETRY` | No | Opt-in del script de terceros (por defecto `false`). |
| `DISABLE_SIGNUP` | No | Cierra el registro; el primer usuario es admin. |
| `BREVO_API_KEY` / `BREVO_DISABLED` | No | Email transaccional/contactos. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | Login con GitHub. |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | Analítica (si la telemetría está activa). |
| `ALLOW_COMPOSE_HOST_ACCESS` | No | Montajes de host en stacks (solo admin, por defecto `false`). |
| `ALLOW_COMPOSE_BUILD` | No | Permite `build:` (solo admin, por defecto `false`). |
| `ALLOW_HOST_PROJECT_OPS` | No | Admin puede gestionar recursos no-Expanse. |
| `TRUST_PROXY` | No | Confía en `X-Forwarded-For` para rate limit (pon `false` sin proxy). |
| `SHARE_TTL_DAYS` | No | Caducidad de shares (`30` por defecto, `0` = nunca). |
| `EXPORT_RETENTION_DAYS` / `TMP_RETENTION_DAYS` | No | Retención de PNG y directorios temporales (7). |
| `EXPANSE_WORK_DIR` | No | Directorio de trabajo de Compose y binds relativos (`/app/.expanse` en Compose). |
| `MAX_COMPOSES_PER_USER` / `MAX_SERVICES_PER_COMPOSE` | No | Cuotas (50/50). |
| `APP_CPUS` / `APP_MEM_LIMIT` | No | Límites del contenedor app (`2.0` / `2g`). |
| `DB_CPUS` / `DB_MEM_LIMIT` | No | Límites de MongoDB (`1.0` / `1g`). |
| `MFA_ENCRYPTION_KEY` | No | Clave para cifrar TOTP (fallback `SECRET_KEY`). |

Consulta `.env.example`, [`docs/SDD.md`](docs/SDD.md) y
[`docs/operations.md`](docs/operations.md).

---

## 📖 Uso

### 1. Diseña

1. **Dashboard → Playground**: crea un proyecto.
2. Abre la biblioteca, busca un servicio o stack y arrástralo al canvas.
3. Conecta nodos para declarar dependencias/redes.
4. Selecciona un nodo para editar imagen, puertos, volúmenes, entorno y recursos.
5. Usa el editor YAML (Monaco) si necesitas ajustar algo manualmente.

### 2. Despliega

1. Pulsa **Run**; si el stack lo admite, el diálogo HA permite elegir réplicas,
   balanceador y *pooling*.
2. Expanse valida puertos, genera el YAML, aplica política/healthchecks/límites y ejecuta
   `docker compose up -d`.
3. Si hay colisión de puertos, reintenta con puertos libres (máximo 5).

### 3. Monitorea

- Panel de ejecución con estado, logs y terminal por contenedor.
- Visor web para servicios HTTP.
- **Dashboard → System** para gestionar el host.
- **Dashboard → My Shares** para enlaces compartidos.

---

## 🗺️ Rutas y APIs

| Ruta | Descripción |
|------|-------------|
| `/{locale}` | Inicio: proyectos del usuario y estado |
| `/{locale}/dashboard` | Panel de proyectos |
| `/{locale}/dashboard/playground?id=<id>` | Editor visual |
| `/{locale}/dashboard/deploys` | Shares del usuario |
| `/{locale}/dashboard/settings` | Cuenta, MFA, backup, sesiones |
| `/{locale}/deploy/settings` | Gestión Docker del host (admin) |
| `/{locale}/login` · `/{locale}/signin` | Login/registro |
| `/{locale}/login/cli` | Token para la CLI |
| `/{locale}/share?id=<id>` | Visor público o protegido |
| `/{locale}/terms` | Términos |

APIs: `GET /api/ping` (liveness), `GET /api/ready` (Mongo + Docker),
`GET /api/compose?id=` (YAML de un share), `POST /api/compose/machine` (import CLI),
`POST /api/compose/save` (guardado keepalive), `GET /api/export/png?shareId=`,
`GET /api/logos/library/[name]` y OAuth/JWT bajo `/api/auth/`.

---

## 🏗️ Arquitectura

### Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 15 (App Router, standalone) · React 19 |
| Canvas | `@xyflow/react` + `elkjs` |
| Estado | Zustand (10 stores) |
| Base de datos | MongoDB (driver oficial, colecciones sin esquema estricto) |
| Auth | JWT HS256 (`jose`) + `bcryptjs` + TOTP |
| UI | Tailwind CSS 3 + Radix UI + lucide-react |
| Editor YAML | Monaco |
| Terminal | xterm.js |
| Validación | Zod + react-hook-form |
| i18n | next-intl (`en`, `es`) |
| Compose | `expanse-docker-lib` |

### Diagrama

```
┌──────────────────────────── Navegador ────────────────────────────┐
│ Next.js App Router (client components)                            │
│ Zustand · React Flow · Monaco · xterm                             │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ RSC / Server Actions          │ fetch APIs
┌───────────────┴───────────────────────────────▼───────────────────┐
│ Next.js standalone (Node 24, contenedor)                          │
│ middleware.ts · actions/* · app/api/* · lib/dockerExec            │
│ RBAC + ownership + política de Compose + auditoría                │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ MongoDB                       │ docker.sock
┌───────────────┴───────────────┐   ┌───────────▼───────────────────┐
│ users · composes · shares     │   │ Docker Engine del host        │
│ reset_code · audit_log        │   │ stacks de todos los usuarios  │
└───────────────────────────────┘   └───────────────────────────────┘
```

### Modelo de datos

- `users`: email único, hash bcrypt, rol, `sessionVersion`, MFA cifrado.
- `composes`: `userId`, `data`, `metadata`, `haConfig`, `haEnabled`, timestamps.
- `shares`: compose, `access`, `expiresAt`, `passwordHash`.
- `reset_code`, `csrf_token`, `audit_log` y `deploy_locks` con TTL.
- Índices creados en `lib/dbIndexes.ts` al arrancar.

### Flujo de despliegue

1. `store/compose.ts` autoguarda con versión optimista.
2. `runCompose()` valida sesión, ownership, tamaño y política del YAML.
3. Genera/parcha el YAML, escribe configuración HA y ejecuta
   `docker compose config --quiet`.
4. `docker compose up -d` con `execFile` (sin shell), etiquetas de propiedad y lock.
5. Estado/logs se consultan por proyecto.

### Estructura

```
app/            Rutas [locale] y API
actions/        Server Actions (auth, docker, HA, backup…)
components/     Playground, editor, tablas, UI
lib/            Docker, Mongo, auth, policy, metadata, TOTP
store/          Zustand
data/library/   142 plantillas
messages/       en.json / es.json
tests/          Vitest
docs/           SDD y runbook de operaciones
```

---

## 📦 Biblioteca de servicios

Cada plantilla vive en `data/library/<slug>.json` y sigue `TemplateService`
(`types/library.ts`). Los stacks añaden `isStack: true` y `related_services`.

```bash
pnpm sanitize-library   # normaliza logo
pnpm sync-icons         # iconos en public/logos/library
pnpm test:docker        # valida todas las plantillas con `docker compose config`
```

> Las plantillas que montan rutas del host requieren
> `ALLOW_COMPOSE_HOST_ACCESS=true`; el socket Docker solo se permite a un admin con ese
> flag. Con los valores por defecto, Portainer/Netdata (socket) quedan bloqueados.

---

## 🐳 Imagen Docker

```bash
docker pull ghcr.io/dinamicas-electronicas/expanse:latest
```

| Dato | Valor |
|---|---|
| Registro principal | `ghcr.io/dinamicas-electronicas/expanse` |
| Registro opcional | `<usuario-dockerhub>/expanse` |
| Arquitecturas | `linux/amd64`, `linux/arm64` |
| Tamaño | ~554 MB sin comprimir por arquitectura |
| Tags | `latest`, `sha-*`, branch, `vX.Y.Z` |
| Escaneo | Trivy HIGH/CRITICAL en CI (sin CVEs con fix) |

El runtime **no incluye npm/yarn/corepack**; solo Node y el bundle standalone. El
repositorio de Docker Hub puede mostrar varios GB porque suma todas las etiquetas y ambas
arquitecturas; el workflow conserva solo los 3 `sha-*` más recientes.

---

## 🧑‍💻 Desarrollo y tests

```bash
pnpm install
pnpm generate-secrets
pnpm dev              # http://localhost:3000
pnpm typecheck
pnpm lint
pnpm test             # 23 archivos, 131 tests
pnpm test:docker      # plantillas contra la CLI real
pnpm build            # standalone
pnpm smoke            # instancia en marcha
pnpm license:check
pnpm migrate:emails   # dry-run
pnpm audit
```

Tests de integración incluyen `docker compose config` para HA y plantillas. No hay suite
E2E/Playwright todavía.

---

## 🛡️ Seguridad y límites

**Modelo:** Expanse monta el socket Docker; una cuenta autenticada equivale a
administrador del host. Para instancias expuestas:

- `DISABLE_SIGNUP=true` tras crear el primer admin.
- HTTPS + `URL=https://…`, `SECRET_KEY` robusta.
- `ALLOW_HOST_PROJECT_OPS=false`, `ALLOW_COMPOSE_HOST_ACCESS=false`.
- Usa `docker-compose.socket-proxy.yml` para evitar el montaje directo del socket.
- Considera `HOST_PROJECT`/red aislada y backups probados.

Implementado: RBAC/ownership, política de Compose, MFA, shares con caducidad/contraseña,
sesiones revocables, rate limit, CSP, auditoría, cuotas y sanitización. Riesgos residuales
documentados en [`docs/SDD.md`](docs/SDD.md) §1.4 (MFA reset por email, rate limit en
memoria, lock de despliegue en proceso, etc.).

Si encuentras una vulnerabilidad, escribe a
[dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com) antes de abrir
un issue público.

---

## 🔁 CI/CD

| Workflow | Cuándo | Qué hace |
|----------|--------|----------|
| `ci.yml` | Push/PR a `main` | Lint, typecheck, licencias, tests y auditoría |
| `docker-image.yml` | Push/PR a `main`, manual | Build multi-arch y push a GHCR; Docker Hub opcional |
| `test-build.yml` | Otras ramas | Build sin push + Trivy |
| `security-scan.yml` | Semanal/manual | Trivy sobre `ghcr.io/...:latest` |
| `release.yml` | Tags `v*`, manual | Imagen multi-arch + GitHub Release |

GHCR no necesita secretos (`GITHUB_TOKEN`, `packages: write`). Docker Hub requiere
`DOCKER_USERNAME`/`DOCKER_PASSWORD`. Los PR construyen solo `amd64` y no publican.

---

## 📚 Operación

Runbook en [`docs/operations.md`](docs/operations.md): `mongodump`/`mongorestore`,
retención, migraciones (`pnpm migrate:emails`), rotación de secretos, incidentes y socket
proxy. Auditoría/modelo de amenazas y backlog en [`docs/SDD.md`](docs/SDD.md).

---

## 🤝 Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Antes de enviar cambios:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## 📄 Autoría y licencia

**Expanse** es un proyecto de **Dinámicas Electrónicas**.

| | |
|---|---|
| **Autor** | Dinámicas Electrónicas |
| **Email** | [dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com) |
| **GitHub** | [@Dinamicas-Electronicas](https://github.com/Dinamicas-Electronicas) |
| **Licencia** | MIT © 2026 Dinámicas Electrónicas |

Todos los archivos fuente incluyen el aviso de autoría. El código se distribuye bajo la
[licencia MIT](LICENSE).

---

## 🔮 Roadmap

- [ ] **v2.0** — Gestión multi-cluster (Kubernetes)
- [ ] **v2.1** — Marketplace de plantillas
- [ ] **v2.2** — GitOps (GitHub Actions)
- [ ] **v2.3** — Workspaces de equipo con RBAC
- [ ] **v2.4** — Despliegue en nubes públicas

El plan detallado está en [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md).

---

<div align="center">
  <sub>Hecho con ❤️ por <strong>Dinámicas Electrónicas</strong> para hacer Docker Compose accesible a todos.</sub>
  <br/>
  <sub>⭐ Si te gusta Expanse, danos una estrella en el repositorio.</sub>
</div>
