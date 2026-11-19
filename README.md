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
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/idiomas-ES%20%7C%20EN-9F7AEA" alt="Idiomas: Español e Inglés" />
  </p>

  <p>
    Desarrollado y mantenido por <strong>Dinámicas Electrónicas</strong><br/>
    <a href="mailto:dinamicas.electronicas@gmail.com">dinamicas.electronicas@gmail.com</a>
  </p>

  <img src="assets/demo1.png" alt="Expanse — Editor visual de Docker Compose" width="100%" />

</div>

---

## 📑 Índice

- [¿Qué es Expanse?](#-qué-es-expanse)
- [Características](#-características)
- [Capturas](#-capturas)
- [Inicio rápido](#-inicio-rápido)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Rutas](#-rutas)
- [Arquitectura](#-arquitectura)
- [Biblioteca de servicios](#-biblioteca-de-servicios)
- [Desarrollo](#-desarrollo)
- [Calidad y tests](#-calidad-y-tests)
- [Seguridad](#-seguridad)
- [CI/CD y publicación](#-cicd-y-publicación)
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
| **Equipos** | Compartir proyectos y sus diagramas con enlaces de solo lectura |
| **Homelab / self-hosting** | Catálogo curado de servicios listos para desplegar |

> Expanse **no** sustituye a Docker: genera Compose válido y ejecuta `docker compose`
> mediante `execFile` con argumentos validados.

---

## ✨ Características

### 🖼️ Canvas visual (React Flow + ELK.js)

- Arrastrar y soltar servicios, redes, volúmenes, bindings, variables y etiquetas.
- Conexiones entre nodos que se traducen en `depends_on`, redes y volúmenes del Compose.
- Auto-layout jerárquico con ELK.js (routers → aplicaciones → bases de datos).
- Editor lateral por tipo de nodo: servicio, red, binding, volumen, entorno y etiquetas.
- Importación y exportación de `docker-compose.yml` sin perder la disposición del canvas.
- Guardado automático con *debounce* de 2 s; la captura del canvas se almacena con el proyecto.

### 📦 Biblioteca de 142 plantillas (25 de ellas stacks)

Plantillas JSON verificadas, con imagen, puertos, variables, volúmenes y logo:

| Categoría | Plantillas | Ejemplos |
|-----------|-----------:|----------|
| **Database** | 19 | PostgreSQL, MySQL, MongoDB, Redis, MariaDB, Cassandra, ClickHouse |
| **AI** | 18 | Ollama, Open WebUI, Qdrant, AnythingLLM, ComfyUI, vLLM |
| **Cloud** | 15 | Nextcloud, Seafile, OwnCloud, Cloudreve, Syncthing |
| **Network** | 14 | Nginx Proxy Manager, Traefik, WireGuard, NetBird, Pi-hole, AdGuard Home |
| **CMS** | 14 | WordPress, Ghost, Strapi, Directus, Drupal, Joomla |
| **Social** | 12 | Mastodon, Pixelfed, Pleroma, Akkoma, Friendica |
| **Monitoring** | 11 | Prometheus, Grafana, Zabbix, Netdata, Uptime Kuma |
| **Automation** | 10 | n8n, Node-RED, Apache Airflow, Activepieces, Windmill |
| **Development** | 9 | Gitea, Appwrite, Elixir, Go, Node.js, PHP, Python, Ruby, Rust |
| **Messaging** | 9 | Rocket.Chat, Zulip, Mattermost, Matrix (Synapse/Dendrite), Prosody |
| **OS** | 6 | Alpine, Debian, Ubuntu, Fedora, Rocky Linux, Amazon Linux |
| **Web server** | 2 | Nginx, PostgREST (HA) |
| **Utilities** | 2 | Portainer, Vaultwarden |
| **Applications** | 1 | Media Center (Jellyfin + Arrs) |

Listado completo y filtrable en `data/library/`; los iconos se generan con
`pnpm sync-icons`.

Los stacks (`isStack: true`) agrupan varios servicios en un solo bloque, por ejemplo
*WordPress (Full Stack)*, *ELK Stack*, *PLG Stack*, *Media Center*, *n8n (Full Stack)* o
*PostgreSQL HA (Patroni)*.

### 🚀 Despliegue

- Validación previa de puertos con reasignación automática ante colisiones (hasta 5 intentos).
- Generación de YAML en `/tmp/expanse-<id>/docker-compose.yaml` y ejecución como
  proyecto `expanse-project_<objectId>`.
- Normalización de nombres de servicios, redes y volúmenes (claves válidas para Compose).
- Inyección de healthchecks para bases de datos, condiciones `service_healthy` y límites
  de CPU/memoria desde los metadatos del canvas.
- Acciones por proyecto: arrancar, parar, reiniciar, estado, logs y eliminación.

### 🔄 Alta disponibilidad

- Diálogo de despliegue HA con réplicas (2–10), balanceador y *connection pooling*.
- Generación de configuración de **HAProxy** (round-robin + health checks) y
  **PgBouncer** (transaction mode) desde `lib/metadata.ts`.
- Plantillas HA listas para usar (Patroni, InnoDB Cluster, Replica Set, Sentinel,
  PostgREST HA) y panel de métricas HA durante la ejecución.

### 📊 Monitoreo y operación

- Estado de cada servicio (`running`, `exited`, `unknown`) y estado global por proyecto.
- Métricas de CPU y memoria por contenedor; estadísticas globales del host.
- Visor web integrado para servicios con puertos HTTP conocidos.
- Logs en streaming con colores por servicio.
- Terminal interactiva por contenedor con **xterm.js**.
- Panel de sistema: proyectos, contenedores, volúmenes e imágenes; *pull* de imágenes y
  búsqueda en Docker Hub.

### 🤝 Colaboración y datos

- Compartir proyectos con enlace público de solo lectura y visor independiente.
- Descarga del Compose compartido en YAML y exportación del canvas a PNG.
- Backup completo de proyectos en JSON desde los ajustes de cuenta.

### 🌐 Internacionalización y autenticación

- **English** (predeterminado) y **Español**, con `next-intl` y rutas `/{locale}`.
- Registro e inicio de sesión con email/contraseña (bcrypt) y sesión **JWT HS256** en
  cookie `HttpOnly`, `SameSite=Lax`, 30 días.
- OAuth con GitHub (opcional) y flujo de autenticación para la CLI.
- Restablecimiento de contraseña por email (Brevo, opcional).

---

## 📸 Capturas

<div align="center">
  <img src="assets/demo1.png" alt="Canvas de Expanse con un stack WordPress + MariaDB desplegado" width="100%" />
  <p><em>Canvas visual, panel de ejecución, logs y terminal integrada.</em></p>
</div>

---

## 🚀 Inicio rápido

### Requisitos

- Docker Engine 20.10+ con Docker Compose v2 y el plugin `buildx`.
- 4 GB de RAM recomendados.
- Puerto `4000` libre.
- pnpm 12 solo si vas a desarrollar o generar secretos localmente.

### Docker Compose (recomendado)

```bash
git clone https://github.com/Dinamicas-Electronicas/expanse.git
cd expanse

# Genera .env con SECRET_KEY, DB_USER y DB_PASS aleatorios
pnpm generate-secrets

docker compose up -d --build
```

Abre <http://localhost:4000>.

> `SECRET_KEY`, `DB_USER` y `DB_PASS` son obligatorios: `docker compose` falla de forma
> explícita si faltan en lugar de arrancar con credenciales por defecto.

### Docker Run directo

Requiere un MongoDB accesible y el socket de Docker:

```bash
docker run -d \
  --name expanse \
  -p 4000:3000 \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e MONGODB_URI="mongodb://usuario:password@host:27017/expanse?authSource=admin" \
  -e URL="http://localhost:4000" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  <usuario-dockerhub>/expanse:latest
```

### Reconstrucción limpia y verificación

```bash
docker compose down --remove-orphans
docker image rm expanse:local
docker builder prune -af

docker compose build --no-cache app
docker compose up -d
pnpm smoke
```

`pnpm smoke` comprueba contenedores, rutas, APIs y cabeceras de seguridad. Los volúmenes
`expanse_db_data` y `expanse_exports` se conservan; usa `docker compose down -v` solo si
quieres borrar también los datos.

---

## ⚙️ Configuración

Toda la configuración se pasa por variables de entorno (no se usa `.env` en runtime más
allá de `docker compose`).

| Variable | Obligatoria | Descripción |
|----------|:-----------:|-------------|
| `SECRET_KEY` | ✅ | Firma de JWT y cookies. Sin ella el middleware responde 500. |
| `MONGODB_URI` | ✅ | Conexión a MongoDB (por defecto `mongodb://localhost:27017`). |
| `URL` | Recomendada | URL pública. Si es `https://` activa `Secure` en la cookie y HSTS. |
| `APP_URL` | Solo Compose | URL usada por `docker-compose.yml` para `URL`. |
| `DB_USER` / `DB_PASS` | Solo Compose | Credenciales del MongoDB del stack. |
| `CORE_ONLY` | No | Modo núcleo: desactiva SEO, marketing y OAuth. |
| `DISABLE_TELEMETRY` | No | Desactiva PostHog y telemetría externa. |
| `DISABLE_SIGNUP` | No | Cierra el registro de nuevas cuentas. |
| `BREVO_API_KEY` / `BREVO_DISABLED` | No | Email transaccional y contactos (Brevo). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | Habilita el login con GitHub. |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | Clave de analítica (si la telemetría está activa). |
| `ENABLE_EXTERNAL_TELEMETRY` | No | Opt-in del script de terceros `opentech-ux` (por defecto `false`). |
| `ALLOW_COMPOSE_HOST_ACCESS` | No | Permite montajes sensibles (socket Docker, `/etc`, …) en stacks desplegados. Por defecto `false`. |
| `ALLOW_COMPOSE_BUILD` | No | Permite `build:` en los Compose desplegados. Por defecto `false`. |
| `ALLOW_HOST_PROJECT_OPS` | No | Permite a un admin gestionar proyectos/contenedores que no son de Expanse. Por defecto `false`. |
| `TRUST_PROXY` | No | Confía en `X-Forwarded-For` para el rate limit (pon `false` si expones la app sin proxy). |

> **Roles:** el primer usuario creado es `admin`. Las operaciones de host (borrar
> contenedores/volúmenes ajenos, ejecutar comandos, gestionar proyectos que no empiezan por
> `expanse-project_`) exigen rol admin y, para recursos no gestionados, el flag explícito
> `ALLOW_HOST_PROJECT_OPS=true`. El resto de usuarios solo opera sus propios proyectos.

Consulta `.env.example` y [`docs/SDD.md`](docs/SDD.md) para el modelo de amenazas y la
auditoría de seguridad.

---

## 📖 Uso

### 1. Diseña

1. Entra en **Dashboard → Playground** y crea un proyecto.
2. Abre la biblioteca, busca un servicio (o un stack) y arrástralo al canvas.
3. Conecta nodos para declarar dependencias y redes.
4. Selecciona cualquier nodo para editar imagen, puertos, volúmenes, entorno y recursos.
5. Usa el editor YAML (Monaco) si necesitas ajustar algo manualmente.

### 2. Despliega

1. Pulsa **Run**. Si el stack lo admite, el diálogo HA permite elegir réplicas,
   balanceador y *pooling*.
2. Expanse valida puertos y reasigna los que estén ocupados.
3. Se genera el YAML, se aplican parches (nombres, healthchecks, límites) y se ejecuta
   `docker compose up -d`.

### 3. Monitorea

- Panel de ejecución con el estado de cada servicio.
- Logs en vivo y terminal por contenedor.
- Visor web para servicios HTTP.
- **Dashboard → System** para gestionar proyectos, contenedores, volúmenes e imágenes
  del host.
- **Dashboard → My Shares** para los enlaces compartidos.

---

## 🗺️ Rutas

| Ruta | Descripción |
|------|-------------|
| `/{locale}` | Inicio: proyectos del usuario, estado y monitor global |
| `/{locale}/dashboard` | Panel de proyectos dentro del layout unificado |
| `/{locale}/dashboard/playground?id=<id>` | Editor visual de un proyecto |
| `/{locale}/dashboard/deploys` | Enlaces compartidos del usuario |
| `/{locale}/dashboard/settings` | Cuenta, backup JSON y seguridad |
| `/{locale}/deploy/settings` | Gestión Docker del host (proyectos, contenedores, volúmenes, imágenes) |
| `/{locale}/login` · `/{locale}/signin` | Inicio de sesión y registro |
| `/{locale}/login/cli` | Autenticación para la CLI local |
| `/{locale}/forgotPassword` | Recuperación de contraseña |
| `/{locale}/share?id=<id>&name=<name>` | Visor de solo lectura de un proyecto compartido |
| `/{locale}/terms` | Términos y condiciones |

APIs principales: `GET /api/ping` (liveness), `GET /api/ready` (Mongo + Docker),
`GET /api/compose?id=` (descarga YAML), `POST /api/compose/machine` (importación
autenticada por token), `POST /api/compose/save` (guardado keepalive al cerrar),
`GET /api/export/png?shareId=`, `GET /api/logos/library/[name]`, y los endpoints de
OAuth/JWT bajo `/api/auth/`.

---

## 🏗️ Arquitectura

### Stack

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 15 (App Router, standalone) · React 19 |
| Canvas | `@xyflow/react` + `elkjs` |
| Estado | Zustand (10 stores en `store/`) |
| Base de datos | MongoDB + driver oficial (colecciones sin esquema estricto) |
| Auth | JWT HS256 (`jose`) + `bcryptjs` |
| UI | Tailwind CSS 3 + Radix UI + lucide-react |
| Editor YAML | Monaco Editor |
| Terminal | xterm.js + addon-fit |
| Validación | Zod + react-hook-form |
| i18n | next-intl (`en`, `es`) |
| Compose | `expanse-docker-lib` (`Compose`, `Service`, `Translator`) |

### Diagrama

```
┌─────────────────────────────────────────────────────────────┐
│                        Navegador                            │
│              http(s)://host:4000  (Next.js)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Contenedor Expanse                       │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────┐  │
│  │  Next.js App   │   │    MongoDB     │   │  ELK.js     │  │
│  │  UI + Actions  │   │  (proyectos)   │   │  (layout)   │  │
│  └───────┬────────┘   └────────────────┘   └─────────────┘  │
│          │ docker compose (execFile)                        │
│          ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Docker Engine                     │   │
│  │  Postgres · Redis · HAProxy · Tu aplicación · …      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

> El socket `/var/run/docker.sock` se monta en el contenedor. **Cualquier cuenta
> autenticada debe considerarse con privilegios de administrador del host.**

### Modelo de datos

```
users ──────▶ composes ──────▶ (data: Compose + metadata)
  │                │
  │                └──────────▶ shares (read-only, access: public | private)
  ├──────────────▶ reset_code   (TTL)
  └──────────────▶ csrf_token    (TTL, OAuth)
```

- `users`: email único, hash de contraseña, empresa, términos aceptados.
- `composes`: `userId`, `data` (Compose + metadatos del canvas), timestamps.
- `shares`: referencia al compose, nombre, tipo de acceso.
- Índices y TTL creados al arrancar desde `lib/dbIndexes.ts` (`instrumentation.ts`).

### Flujo de despliegue

1. `store/compose.ts` autoguarda el proyecto en MongoDB (debounce de 2 s).
2. El cliente llama a `runCompose()` en `actions/dockerActions.ts` (Server Action).
3. `ensureAuth()` valida la sesión y `validateComposePorts()` resuelve colisiones.
4. Se escribe el YAML en `/tmp/expanse-<id>/docker-compose.yaml`.
5. `lib/dockerCompose.ts` normaliza claves, inyecta healthchecks y aplica límites.
6. `lib/dockerExec.ts` ejecuta `docker compose up -d` con `execFile` y argumentos
   validados (nunca interpolación de shell).
7. El estado y los logs se consultan con `docker compose ps/logs/stats`.

### Estructura del proyecto

```
app/                 Rutas [locale] y API routes
actions/             Server Actions (compose, docker, auth, HA, backup…)
components/          UI: playground, editor, display, ui
lib/                 Docker, Mongo, auth, validación, metadata, sesión
store/               Zustand (compose, execution, metadata, HA…)
data/library/        142 plantillas JSON de servicios y stacks
messages/            Catálogos en.json / es.json
tests/               Vitest (unitarios e integración)
scripts/             sync-icons, sanitize-library, secretos, smoke, licencias
docs/SDD.md          Auditoría, modelo de amenazas y backlog
```

---

## 📦 Biblioteca de servicios

Cada plantilla vive en `data/library/<slug>.json` y sigue `TemplateService`
(`types/library.ts`):

```json
{
  "name": "MySQL",
  "image": "mysql:8.0",
  "category": "Database",
  "logo": "mysql",
  "description": "Relational database…",
  "default_ports": ["3306:3306"],
  "env_vars": { "MYSQL_ROOT_PASSWORD": "password" },
  "volumes": ["mysql_data:/var/lib/mysql"]
}
```

Los stacks añaden `isStack: true` y `related_services`. Tras añadir o editar una plantilla:

```bash
pnpm sanitize-library   # normaliza el campo logo
pnpm sync-icons         # descarga/sincroniza iconos en public/logos/library
pnpm test:docker        # valida todas las plantillas con `docker compose config`
```

Los nombres con espacios o paréntesis se sanean con `sanitizeDockerName()` antes de
generar el YAML.

> **Montajes privilegiados:** las plantillas que necesitan rutas del host (p. ej. WireGuard)
> requieren `ALLOW_COMPOSE_HOST_ACCESS=true`. El socket de Docker solo se permite a un
> **admin** y con ese mismo flag; para el resto de cuentas se rechaza siempre.

---

## 🧑‍💻 Desarrollo

```bash
pnpm install            # dependencias
pnpm generate-secrets   # crea .env con SECRET_KEY/DB_USER/DB_PASS
pnpm dev                # http://localhost:3000 (Turbopack)
pnpm typecheck          # tsc --noEmit
pnpm lint               # ESLint 9 (flat config)
pnpm test               # Vitest
pnpm test:docker        # plantillas contra `docker compose config`
pnpm sync-icons         # necesario antes de build
pnpm build              # build de producción (standalone)
pnpm smoke              # smoke test contra una instancia en marcha
pnpm license:check      # verifica avisos de autoría
pnpm audit              # falla con avisos altos/críticos
```

Notas:

- MongoDB en `MONGODB_URI` (por defecto `mongodb://localhost:27017`) y socket de Docker
  en `/var/run/docker.sock`.
- El proyecto usa **pnpm 12**; la configuración (`overrides`, `patchedDependencies`,
  `allowBuilds`) está en `pnpm-workspace.yaml`.
- `next.config.mjs` ignora errores de tipos/ESLint durante el build, pero CI ejecuta
  `typecheck` y `lint` por separado.

---

## ✅ Calidad y tests

- **Vitest** con jsdom: 19 archivos y 118 casos (116 activos) que cubren validación,
  sesión, rate limit, ejecución Docker, generación de Compose/HA, plantillas, stores,
  política de Compose, autorización de proyectos, imágenes y puertos.
- Tests de integración que renderizan cada plantilla y la validan con la CLI real de
  Compose (se omiten si Docker no está disponible).
- CI en GitHub Actions: `lint`, `typecheck`, cabeceras de licencia, tests y `pnpm audit`.

```bash
pnpm test
pnpm test:docker:all   # fuerza la validación de todas las plantillas
```

---

## 🛡️ Seguridad

Expanse ejecuta Docker desde la aplicación, por lo que el modelo de amenazas asume que
una cuenta comprometida equivale a acceso al host. Antes de exponerlo a Internet:

- Usa HTTPS y una `SECRET_KEY` robusta (`pnpm generate-secrets`).
- Restringe el registro (`DISABLE_SIGNUP=true`) o el acceso por red/VPN.
- No publiques el puerto de MongoDB.
- Revisa el modelo de amenazas completo en [`docs/SDD.md`](docs/SDD.md).

Medidas implementadas:

- **RBAC:** el primer usuario es `admin`; las operaciones de host exigen ese rol y los
  recursos no gestionados requieren `ALLOW_HOST_PROJECT_OPS=true`.
- **Propiedad por proyecto:** todas las acciones Docker cargan el Compose filtrando por
  `userId`; el `_id` de un proyecto no es una capability.
- **Política de Compose:** se rechazan `privileged`, `cap_add`, `devices`, `pid/ipc/uts`,
  `network_mode: host`, montajes de rutas sensibles y el socket de Docker. Los montajes de
  host y `build:` requieren un opt-in explícito del operador.
- Toda Server Action llama a `ensureAuth()` y filtra consultas por `userId`.
- Sesiones JWT con `sessionVersion`: cambiar la contraseña invalida las sesiones previas.
- Validación de entrada con Zod en el límite del servidor.
- Rate limiting en login, registro, reset, token de API y CLI.
- Cookies `HttpOnly`, `SameSite=Lax` y `Secure` cuando `URL` es HTTPS.
- Ejecución de Docker con `execFile`, validación de IDs y etiquetas
  `com.expanse.owner`/`com.expanse.compose`.
- Cabeceras de seguridad (CSP, nosniff, frame options, referrer policy, COOP, HSTS).
- Índices únicos y TTL para sesiones, resets y CSRF.

Si encuentras una vulnerabilidad, escribe a
[dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com) antes de abrir
un issue público.

---

## 🔁 CI/CD y publicación

| Workflow | Cuándo | Qué hace |
|----------|--------|----------|
| `ci.yml` | Push/PR a `main` | Lint, typecheck, licencias, tests y auditoría |
| `docker-image.yml` | Push/PR a `main` | Build de la imagen (y push a Docker Hub en `main`) |
| `test-build.yml` | Otras ramas | Build de prueba sin publicar |
| `release.yml` | Tags `v*` | Imagen multi-arquitectura + GitHub Release |

La imagen se publica para `linux/amd64` y `linux/arm64` usando los secretos
`DOCKER_USERNAME` y `DOCKER_PASSWORD`.

---

## 🤝 Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de pull requests, los estándares de
código y la convención de cabeceras de autoría. Antes de enviar cambios:

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

Todos los archivos fuente incluyen el aviso de autoría:

```text
Expanse — IDE visual de Docker Compose
Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
Licencia MIT — consulta el archivo LICENSE en la raíz del proyecto.
```

El código se distribuye bajo la [licencia MIT](LICENSE): puedes usarlo, modificarlo y
redistribuirlo conservando el aviso de copyright.

---

## 🔮 Roadmap

El plan de producto detallado (workspaces de equipo, Docker remoto, marketplace,
GitOps y Kubernetes) está en [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md). Próximos hitos:

- [ ] **v2.0** — Gestión multi-cluster (Kubernetes)
- [ ] **v2.1** — Marketplace de plantillas con valoraciones
- [ ] **v2.2** — Integración GitOps (GitHub Actions)
- [ ] **v2.3** — Workspaces de equipo con RBAC
- [ ] **v2.4** — Despliegue en nubes públicas (AWS, GCP, Azure)

---

<div align="center">
  <sub>Hecho con ❤️ por <strong>Dinámicas Electrónicas</strong> para hacer Docker Compose accesible a todos.</sub>
  <br/>
  <sub>⭐ Si te gusta Expanse, danos una estrella en el repositorio.</sub>
</div>
