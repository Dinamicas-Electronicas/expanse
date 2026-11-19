# SDD — Revisión integral, corrección y mejora

| Campo | Valor |
|---|---|
| Proyecto | Expanse — IDE visual para Docker Compose |
| Versión | `1.1.5` · commit `f5a0bfd` (+ limpieza de código sin publicar) |
| Fecha | 19 de noviembre de 2026 |
| Alcance | UI (dashboard, playground, settings), Server Actions, API routes, middleware, generación de Compose/HA, persistencia MongoDB, Docker, i18n y build |
| Método | Revisión estática línea a línea de `app/`, `actions/`, `components/`, `lib/` y `store/` + `typecheck`, `lint`, `test` y `pnpm audit` |
| Sustituye | Al SDD del ciclo 1 (auditoría inicial). Los hallazgos ya cerrados se resumen en §2.3 |

---

## 1. Resumen ejecutivo

El código compila, pasa 84 tests y no tiene vulnerabilidades conocidas en dependencias, pero
la revisión encontró **57 defectos**: 2 críticos, 13 altos, 24 medios y 18 bajos. La mayoría
no son errores de sintaxis, sino **de modelo de autorización, de confianza en datos del
cliente y de flujos de producto a medio conectar**.

Los cinco riesgos que deben resolverse antes de exponer una instancia a Internet:

1. **Cualquier visitante puede registrarse aunque el registro esté cerrado** llamando
   directamente a `createOrLoginUser` (Server Action pública que no comprueba
   `DISABLE_SIGNUP`, ni términos, ni rate limit).
2. **El YAML se acepta sin política de seguridad**: un usuario autenticado puede montar
   `/`, `/etc` o `/var/run/docker.sock`, usar `privileged`, `network_mode: host` o `build:`
   y escapar del contenedor.
3. **Las acciones Docker de proyecto no comprueban propiedad**: `stopCompose`, `restartCompose`,
   `getComposeStatus` y `getComposeLogs` operan sobre cualquier `composeId` conocido.
4. **La consola de host no tiene RBAC**: `removeProjectByName`, `removeVolume` y
   `execDockerCommand` actúan sobre cualquier recurso del host solo con estar autenticado.
5. **Todo el subsistema HA está desconectado**: la configuración elegida en el diálogo no se
   persiste, y el generador produce un stack que no arranca en Docker Compose no-swarm
   (red `overlay`, puerto 5432 duplicado, imagen `postgres` sin Patroni).

Además hay fallos funcionales visibles: **la página de inicio nunca se muestra** (comprueba
una cookie `HttpOnly` con `document.cookie`), **el logout de la portada no cierra sesión**,
**borrar un proyecto no pide confirmación** y **"Cancelar" al crear un proyecto descarta los
cambios**.

### Estado por área

| Área | Crítico | Alto | Medio | Bajo |
|---|---:|---:|---:|---:|
| Seguridad | 2 | 6 | 6 | 2 |
| Funcionalidad / datos | — | 4 | 6 | 4 |
| Estabilidad / rendimiento | — | 1 | 6 | 5 |
| UX / accesibilidad / i18n | — | 1 | 4 | 4 |
| Arquitectura / mantenimiento | — | 1 | 2 | 3 |
| **Total** | **2** | **13** | **24** | **18** |

### 1.1 Implementado en el ciclo 3 (bloque P0)

El 19 de noviembre de 2026 se aplicó el bloque P0 completo. Los hallazgos siguen en el
registro como línea base de auditoría; los siguientes quedan **cerrados**:

| Tarea P0 | Hallazgos | Implementación |
|---|---|---|
| Autorización y RBAC | SEC-23, SEC-24, SEC-25, ARC-02 | `lib/authorization.ts` (`requireUser`, `requireAdmin`, `requireCompose`), etiquetas `com.expanse.owner/compose`, ownership en todas las acciones Docker, roles en MongoDB y bootstrap del primer admin. |
| Política de Compose | SEC-22 | `lib/composePolicy.ts` + `docker compose config --quiet` antes de `up`. Montajes sensibles, `privileged`, `cap_add`, `devices`, `network_mode: host` y `build:` se rechazan por defecto. |
| Registro y auth | SEC-21, SEC-26, SEC-27, SEC-28, SEC-33 | `createOrLoginUser` es solo login; `registerUser`/OAuth respetan `DISABLE_SIGNUP`; primer admin atómico (`lib/users.ts`); códigos de reset con CSPRNG; `sessionVersion` invalida sesiones al resetear; `/api/auth/jwt` con rate limit y parseo correcto. |
| Portada y logout | FUNC-09 | La portada deja de leer `document.cookie`; el logout llama a la Server Action. |
| HA | FUNC-01, FUNC-02, FUNC-03 | `haConfig`/`haEnabled` persistidos; generador reescrito (bridge, Bitnami Postgres, réplicas `db-replica-N`, HAProxy TCP, PgBouncer, backup); estado por `Service`; restauración con credenciales reales. |
| Confirmaciones | UX-13, FUNC-06, FUNC-07 | Confirmación antes de borrar/quitar despliegue; «Cancelar» ya no descarta; borrado de cuenta con contraseña en servidor. |
| Telemetría, versión y CSP | SEC-32, SEC-36 | Script externo solo con `ENABLE_EXTERNAL_TELEMETRY=true`; versión consultada en `Dinamicas-Electronicas/expanse`; CSP añadida. |

> **Alcance HA:** el generador crea una topología desplegable y validada con Compose, pero
> **no reconecta automáticamente** los servicios existentes del stack al nuevo proxy ni
> migra los datos del servicio Postgres original. Esa integración (y el failover real)
> queda en P1.

**Verificación del ciclo 3**

```text
pnpm typecheck   ✅
pnpm lint        ✅ 0 errores (3 warnings preexistentes)
pnpm test        ✅ 18 archivos, 110 tests OK, 2 skipped
pnpm build       ✅ standalone
HA + docker compose config --quiet  ✅ (test de integración)
pnpm audit       ✅ 0 advisories
```

Nuevos módulos: `lib/authorization.ts`, `lib/composePolicy.ts`, `lib/users.ts`,
`lib/composeStore.ts`, `lib/github.ts`, `lib/imageRef.ts`.
Nuevos tests: `tests/lib/composePolicy.test.ts`, ampliación de `tests/actions/auth.test.ts`
y validación real del Compose HA con la CLI.

Quedan abiertos los bloques **P1** (concurrencia de guardado, timeouts Mongo, polling,
i18n/accesibilidad, stubs, layout raíz) y **P2** (MFA, shares firmados, audit log, límites,
socket proxy).

---

## 2. Alcance, método y estado

### 2.1 Comprobaciones automáticas ejecutadas

```bash
pnpm typecheck          # OK (0 errores)
pnpm lint               # OK (0 errores, 3 warnings de react-refresh)
pnpm test               # 18 archivos, 110 tests OK, 2 skipped
pnpm audit --audit-level=high  # 0 advisories
```

Estas comprobaciones no detectan ninguno de los hallazgos de este documento: son defectos de
lógica, autorización o diseño, no de tipos.

### 2.2 Límites de esta revisión

- **No se repitió la prueba dinámica contra un contenedor en este ciclo.** Los hallazgos son
  estáticos y citan `archivo:línea`; los que dependen de comportamiento (p. ej. nombres de
  contenedores de `docker compose ps`) se marcan como «verificar en integración».
- No se ha modificado ningún dato del operador.
- Los IDs `SEC-21+`, `FUNC-*`, `STB-13+`, `UX-13+` y `ARC-*` continúan la numeración del
  ciclo 1 para no reutilizar identificadores ya cerrados.

### 2.3 Ciclo 1 — ya corregido (no reabrir)

| Área | Cambios vigentes |
|---|---|
| Auth | Account takeover de `createOrLoginUser`, IDOR de `getComposeByIdPublic`, validación de registro, cookie `HttpOnly/SameSite/Secure`, rate limit básico |
| Autorización | Ownership en shares y acciones HA; `ensureAuth()` en sistema y nodos |
| APIs | `/api/export/png` con BD correcta y solo shares públicos; `/api/compose` con 400; allowlist de logos |
| Middleware | Locales validados, `/deploy` protegido, sin bucle si falta `SECRET_KEY` |
| Estabilidad | Crash del dashboard corregido, carrera de autoguardado entre proyectos, body limit 4 MB, índices/TTL |
| Limpieza | Documentación obsoleta, código muerto y assets duplicados eliminados; README reescrito |

---

## 3. Arquitectura y límites de confianza

```
┌──────────────────────────── Navegador ────────────────────────────┐
│ Next.js App Router (client components)                            │
│ Zustand (compose, execution, metadata) · React Flow · Monaco      │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ RSC / Server Actions          │ fetch APIs
┌───────────────┴───────────────────────────────▼───────────────────┐
│ Next.js standalone (Node 24, contenedor root)                    │
│ middleware.ts → next-intl + JWT                                  │
│ actions/*      → Server Actions (ensureAuth, sin ownership en    │
│                  varias acciones de Docker)                       │
│ app/api/*      → APIs públicas (share) o con JWT (CLI)           │
│ lib/dockerExec → execFile(docker …)  (sin shell)                 │
│ lib/metadata   → generador Compose/HA                            │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ MongoDB (expanse)              │ /var/run/docker.sock
┌───────────────┴───────────────┐   ┌────────────▼───────────────────┐
│ users · composes · shares     │   │ Docker Engine del host         │
│ reset_code · csrf_token       │   │ contenedores de todos los users │
└───────────────────────────────┘   └────────────────────────────────┘
```

**Límites de confianza**

1. **Cliente → servidor: no confiable.** El cliente puede enviar cualquier `yamlContent`,
   `composeId`, `projectName`, `containerId`, `imageBase64` o `userId`.
2. **Servidor → Docker: privilegiado.** Montar el socket convierte la app en una consola de
   administración; autenticarse equivale, por diseño, a root sobre el host.
3. **Servidor → MongoDB: confiable para integridad, no para autorización.** Cada consulta
   debe filtrar por `userId`; el `_id` nunca es una capability.
4. **Servidor → Internet:** GitHub, Brevo, Docker Hub, CDN de iconos y un script de
   telemetría de terceros.

> **Premisa de producto:** Expanse no es multi-tenant seguro. Si se mantiene el registro
> abierto, cualquier cuenta nueva obtiene control del host. El plan P0 lo asume y propone
> RBAC + política de Compose + registro cerrado por defecto.

---

## 4. Registro de hallazgos

Escala: **Crítica** (compromiso del host o bypass total de auth), **Alta** (acceso cruzado,
feature principal rota o pérdida de datos), **Media** (impacto limitado o requiere condiciones),
**Baja** (endurecimiento, mantenimiento o deuda técnica).

### 4.1 Seguridad

| ID | Sev. | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| **SEC-21** | Crítica | `createOrLoginUser` es una Server Action pública que **crea usuarios sin comprobar `DISABLE_SIGNUP`**, sin términos, sin `company` y sin rate limit. OAuth (`loginOrRegisterOAuthUser`) tampoco respeta `DISABLE_SIGNUP`. | `actions/userActions.ts:33-82`, `lib/oauth.ts:25-48` | Bypass del cierre de registro; creación masiva de cuentas; cuentas sin consentimiento |
| **SEC-22** | Crítica | El YAML del cliente se ejecuta **sin política de seguridad**. No se rechazan `privileged`, `cap_add`, `devices`, `pid/ipc: host`, `network_mode: host`, montajes de `/`, `/etc`, `/root`, `/var/run/docker.sock` ni `build:` con contexto arbitrario. | `actions/dockerActions.ts:37-190`; `lib/dockerCompose.ts:208-254` | Escape del contenedor → root en el host |
| **SEC-23** | Alta | **IDOR en acciones Docker de proyecto.** `runCompose`, `stopCompose`, `restartCompose`, `getComposeStatus` y `getComposeLogs` solo llaman a `ensureAuth()`; no verifican que el compose pertenezca al usuario. | `actions/dockerActions.ts:42,51,193-212,215-226,288-341` | Parar/leer logs de stacks ajenos; fuga de secretos en logs |
| **SEC-24** | Alta | **Operaciones de host sin RBAC.** `stopProjectByName`, `removeProjectByName` (borra volúmenes), `stopContainer`, `removeContainer`, `removeVolume` y `execDockerCommand` aceptan cualquier referencia del host. No se exige rol admin ni se limita el prefijo `expanse-project_`. | `actions/dockerActions.ts:553-655,775-791` | Destrucción de contenedores/volúmenes de otros proyectos del host; `sh -c` en cualquier contenedor |
| **SEC-25** | Alta | `registerComposeWithoutMetadata(compose, userId)` se exporta desde un módulo `'use server'` y **acepta el `userId` como parámetro**. | `actions/userActions.ts:185-198` | Escritura de proyectos en la cuenta de otro usuario |
| **SEC-26** | Alta | `getGithubAccesToken(code)` se exporta desde `actions/github.ts` (`'use server'`) y **devuelve el access token de GitHub** al invocador. | `actions/github.ts:18-34` | Endpoint público para canjear códigos OAuth con el `client_secret` de la app |
| **SEC-27** | Alta | `/api/auth/jwt` (Basic Auth) **no tiene rate limiting**, normaliza mal el email, `bcrypt.compare` con `user.password` indefinido lanza 500 y `split(':')` rompe contraseñas con `:`. | `app/api/auth/jwt/route.ts:16-55` | Fuerza bruta de credenciales; CLI rota para contraseñas válidas con `:` |
| **SEC-28** | Alta | Los **códigos de reseteo se generan con `Math.random`** (no CSPRNG) y, tras resetear, **no se invalidan las sesiones JWT** existentes. | `lib/utils.ts:50-58`; `actions/userActions.ts:453,505-508` | Predicción/adivinación del código; sesión robada sigue válida 30 días |
| **SEC-29** | Media | El rate limit usa `x-forwarded-for` **sin proxy de confianza** y el `Map` de buckets **nunca se purga**. | `lib/rateLimit.ts:13,28-52` | Bypass por cabecera falsificada; crecimiento de memoria |
| **SEC-30** | Media | Compartir publica **el Compose completo con variables de entorno y contraseñas**; el enlace es permanente, sin advertencia ni revocación desde el visor. `/api/compose?id=` devuelve el YAML íntegro. | `actions/composeActions.ts:50-61`; `app/api/compose/route.ts:17-46` | Cualquiera con el enlace obtiene credenciales de la base de datos |
| **SEC-31** | Media | `deleteUser` **anonimiza** los composes (`userId: null`) en vez de borrarlos, **no elimina los shares públicos** y redirige a un formulario externo. No exige contraseña en servidor. | `actions/userActions.ts:369-394`; `components/display/settings.tsx:63-73` | Proyectos compartidos siguen públicos tras borrar la cuenta; borrado incompleto |
| **SEC-32** | Media | Script de terceros `opentech-ux.org` cargado por defecto con `beforeInteractive`; la comprobación de versión consulta **`lordpietre/expanse`**, no este repositorio, en cada render (hasta 2 s). | `app/[locale]/layout.tsx:32-59`; `lib/utils.ts:66-105` | Telemetría no consentida; fuga de tráfico; banner de versión incorrecto; latencia |
| **SEC-33** | Media | El primer usuario es admin por `countDocuments() === 0`; dos registros concurrentes pueden **ambos** ser admin. | `actions/userActions.ts:65-74`; `lib/oauth.ts:35-42` | Escalada de rol en instalaciones nuevas |
| **SEC-34** | Baja | `deleteCompose` no valida el ObjectId, no borra los shares asociados y deja contenedores/volúmenes en ejecución. | `actions/userActions.ts:401-413` | Error 500 con IDs inválidos; shares huérfanos; recursos fantasma |
| **SEC-35** | Baja | Los PNG se guardan en `public/exports` con nombre derivado del **checksum del contenido**, servidos estáticamente; dos usuarios con el mismo Compose comparten fichero. `exportPlaygroundAsPNGToFile` no comprueba propiedad. | `actions/userActions.ts:162-178`; `app/actions/exportActions.ts:118-168` | Colisión entre usuarios; exposición directa sin pasar por la API |
| **SEC-36** | Media | No hay **CSP** y el build ignora errores de tipos/ESLint (`ignoreBuildErrors`, `ignoreDuringBuilds`). | `next.config.mjs:38-46` | Menor defensa contra XSS; errores que solo detecta CI |

### 4.2 Funcionalidad y datos

| ID | Sev. | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| **FUNC-01** | Alta | **La configuración HA nunca se persiste.** `haDeploymentDialog` pasa un objeto efímero a `runCompose`, pero nadie escribe `haConfig`/`haEnabled` en MongoDB. `restartCompose` no recibe HA y todas las acciones `getHAStatus`, `simulateFailover`, `triggerBackup`, `listBackups`, `restoreBackup` exigen `doc.haEnabled`, que siempre es falso. | `components/playground/playGroundContent.tsx:294-347`; `actions/dockerActions.ts:54-83,228-257`; `actions/databaseHA.ts:384-386,519-522,629-631` | Toda la UI HA es decorativa; el reinicio pierde el balanceador/pooling |
| **FUNC-02** | Alta | **El Compose HA generado no arranca** en Compose normal: red `overlay` (requiere swarm), `5432:5432` publicado por `db-primary`, `db-replica` y `haproxy`, imagen `postgres:16-alpine` sin Patroni ni entrypoint, `depends_on: haproxy` aunque el LB esté desactivado, `deploy.placement` y `{{.Task.Slot}}` exclusivos de swarm. | `lib/metadata.ts:492-663` | «Deploy with HA» falla o queda degradado |
| **FUNC-03** | Alta | `getHAStatus` busca contenedores por `Name` (`expanse-project_x-db-primary-1`) cuando debería usar `Service`; nunca encuentra el primario → estado `critical`. Métricas de pool devueltas a cero y `restoreBackup` usa usuario/BD hardcodeados (`postgres`/`expanse`). | `actions/databaseHA.ts:424-470,724-756,793-810` | Panel HA siempre en rojo; métricas y restauración falsas |
| **FUNC-04** | Media | `validateComposePorts` solo entiende `"host:container"`: ignora `"IP:host:container"`, `/tcp|udp` y rangos. `getAvailablePort` no conoce los puertos ya reservados en el mismo YAML y puede devolver duplicados. `checkPort` escucha **dentro del contenedor**, no en el host, por lo que no detecta servicios nativos del host. | `actions/dockerActions.ts:514-551,725-773` | Colisiones que solo aparecen al desplegar; reintentos innecesarios |
| **FUNC-05** | Media | `isExecuting` solo pasa a `true`; si todos los contenedores se paran o mueren, la UI sigue en modo «Stop» y sigue haciendo polling. No hay pausa con `document.hidden` ni backoff. | `components/playground/playGroundContent.tsx:239-284` | Estado mentiroso; llamadas Docker cada 3–8 s de forma indefinida |
| **FUNC-06** | Media | «Delete File» y «Remove Deployment» **no piden confirmación** y no son coherentes: borrar fichero deja el stack corriendo; quitar el despliegue borra volúmenes por defecto. | `components/display/composeTable/composeRow.tsx:24-64` | Pérdida de datos con un clic |
| **FUNC-07** | Media | En «New», el `confirm()` pregunta «¿guardar antes de crear?» pero **Cancelar también descarta** y no aborta la creación. | `components/playground/playGroundContent.tsx:133-142` | Pérdida de cambios silenciosa |
| **FUNC-08** | Media | El parseo de imágenes usa `split(':')`: rompe `registry:5000/app`, `ghcr.io/org/app:tag` y digests `@sha256:`. | `store/compose.ts:251,405-407` | Servicios con imagen incorrecta o tag perdido |
| **FUNC-09** | Alta | La portada comprueba la sesión leyendo `document.cookie`, pero el token es `HttpOnly`: **siempre redirige**. Además, el botón de logout de la portada borra una cookie inexistente en vez de llamar a `logout()`. | `app/[locale]/page.tsx:38-42,141-147` | La lista de proyectos de `/` nunca se ve; el logout no cierra sesión |
| **FUNC-10** | Baja | `loginUser` y `askPasswordReset` no normalizan el email a minúsculas; el registro sí lo hace. | `actions/userActions.ts:229-249,431-446` | Login/reseteo falla con mayúsculas |
| **FUNC-11** | Baja | `resetCompose` limpia el id **antes** de leerlo para parar el polling HA. | `store/compose.ts:195-205` | El polling/config HA del proyecto anterior no se limpia |
| **FUNC-12** | Baja | `revalidatePath("/dashboard/shares")` apunta a una ruta inexistente (la real es `/dashboard/deploys`). Hay dos dashboards con lógica duplicada y divergente (logout incluido). | `actions/composeActions.ts:44,146`; `app/[locale]/page.tsx` vs `app/[locale]/dashboard/(dashboard)/page.tsx` | Listas desactualizadas; deriva de comportamiento |
| **FUNC-13** | Baja | `/api/compose/machine` hace `Object.keys(body?.volumes)` sin fallback y `image.split(':')` sin comprobar el tipo; un Compose sin volúmenes/redes devuelve 403 engañoso. | `app/api/compose/machine/route.ts:40-67` | Importación CLI falla con archivos válidos |
| **FUNC-14** | Media | Funciones **stub presentadas como reales**: guardar nodos remotos devuelve éxito sin guardar, Google Drive devuelve «coming soon», las métricas de pool son ceros y «Reapply limits» siempre muestra error. La ruta `export-render` está muerta y `actions/exportActions.ts` está duplicado. | `actions/systemActions.ts:58-65`; `actions/backupActions.ts:44-48`; `actions/databaseHA.ts:793-810`; `components/display/projectMonitor.tsx:70-72` | El usuario cree que ha configurado algo que no existe |

### 4.3 Estabilidad y rendimiento

| ID | Sev. | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| **STB-13** | Alta | Guardado **last-write-wins** sin versión; dos pestañas se sobrescriben. El guardado en `beforeunload` es un `fetch` asíncrono sin `keepalive`/`sendBeacon`, que el navegador puede cancelar. | `actions/userActions.ts:141-151`; `store/compose.ts:113-137` | Pérdida de trabajo |
| **STB-14** | Media | `MongoClient` sin `serverSelectionTimeoutMS`, retry ni endpoint `/api/ready`; si Mongo cae, las peticiones esperan ~30 s y devuelven errores genéricos. | `lib/mongodb.ts:18-42`; `app/api/ping/route.ts` | Cuelgues y diagnóstico difícil |
| **STB-15** | Media | Sin límites de CPU/memoria para app/db; `/tmp/expanse-*` y `public/exports` crecen sin retención. Cada autoguardado ejecuta `html-to-image` sobre todo el canvas. | `docker-compose.yml`; `store/compose.ts:49-67` | Agotamiento del host; UI congelada |
| **STB-16** | Media | Sin bloqueo por proyecto: dos clics en Run lanzan dos `docker compose up` concurrentes; Run/Restart no se excluyen. | `components/playground/playGroundContent.tsx:294-470` | Estado inconsistente y errores de Compose |
| **STB-17** | Media | Todas las operaciones Docker comparten `timeout: 30 min`; no hay cancelación ni timeout por tipo (ps/logs/stats deberían ser segundos). | `lib/dockerExec.ts:22` | Peticiones colgadas 30 min |
| **STB-18** | Media | Polling sin backoff ni pausa en pestaña oculta; `ProjectMonitor` llama a `docker stats` cada 3 s mientras esté montado. | `components/display/projectMonitor.tsx:50-64` | Carga alta en el daemon |
| **STB-19** | Baja | 25 `console.log` sin estructura; se devuelven `error.message` de Docker al cliente (rutas internas, nombres de contenedores). | `actions/dockerActions.ts` (varios) | Poca observabilidad; fuga de detalles |
| **STB-20** | Media | El test de HA **valida el diseño roto** (afirma que la red es `overlay`) y no se prueba `docker compose config/up`; no hay tests de autorización ni E2E. | `tests/integration/haGeneration.integration.test.ts:76-92` | Falsa confianza |
| **STB-21** | Baja | El healthcheck solo usa `/api/ping` (proceso vivo), no comprueba Mongo ni el socket Docker. | `docker-compose.yml` | Reinicios no detectan dependencias caídas |
| **STB-22** | Baja | El índice único de `users.email` puede fallar silenciosamente con datos legacy duplicados; no hay migración de normalización. | `lib/dbIndexes.ts:29-44` | Duplicados y lookups inconsistentes |
| **STB-23** | Baja | El intervalo de iconos no usa `unref()` y la detección de proceso principal usa la variable mal escrita `NEXT_MANUAL_SIGIG`. | `instrumentation.ts:18-34` | Tareas duplicadas; proceso retenido |
| **STB-24** | Baja | El parseo de `docker system df -v` por líneas/espacios es frágil ante cambios de formato o nombres con espacios. | `actions/dockerActions.ts:407-441,690-717` | Tamaños de volumen incorrectos |

### 4.4 UX, accesibilidad e i18n

| ID | Sev. | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| **UX-13** | Alta | Operaciones destructivas sin confirmación (borrar proyecto, quitar despliegue) y diálogo de «New» con semántica invertida. | `composeRow.tsx:24-64`; `playGroundContent.tsx:133-142` | Pérdida de datos |
| **UX-14** | Media | Cadenas en inglés hardcodeadas en una app bilingüe (settings, playground, errores); **0 `aria-label`** en botones solo-icono; foco y contraste irregulares. | `components/display/settings.tsx`, `playGroundContent.tsx`, `composeRow.tsx` | i18n incompleta; app no navegable con lector de pantalla |
| **UX-15** | Media | Errores de despliegue crudos («Bind for ... failed»), reasignación de puertos solo por toast y sin resumen previo; el usuario no puede elegir. | `playGroundContent.tsx:361-387` | Difícil de diagnosticar |
| **UX-16** | Media | Compartir no advierte de que el enlace incluye variables de entorno; no hay revocación desde el visor ni caducidad. | `actions/composeActions.ts:50-61`; `share/page.tsx` | Fuga de credenciales por compartir |
| **UX-17** | Media | Los stubs (nodos remotos, Google Drive, métricas HA, reapply limits) parecen features funcionales. | Ver FUNC-14 | Expectativas falsas |
| **UX-18** | Baja | Estados de carga/error/empty inconsistentes entre portada y dashboard; varios `catch` solo hacen `console.error`. | `app/[locale]/page.tsx`, `dashboard/(dashboard)/page.tsx`, `projectMonitor.tsx` | Pantallas en blanco sin explicación |
| **UX-19** | Baja | El flujo CLI pasa el token por query string a `http://localhost:5555` fijo y no explica el estado. | `app/[locale]/login/cli/page.tsx`; `app/api/auth/external/cli/route.ts:54-56` | Token en historial; no funciona en remoto |
| **UX-20** | Baja | Dos implementaciones del listado de proyectos con distinto logout/errores. | `app/[locale]/page.tsx` vs `dashboard/(dashboard)/page.tsx` | Comportamiento impredecible |
| **UX-21** | Baja | No se respeta `prefers-reduced-motion`; animaciones `animate-pulse`/`animate-liquid` permanentes; textos `text-slate-500` pequeños sobre fondo oscuro. | `playGroundContent.tsx`, `UnifiedLayout.tsx` | Accesibilidad y legibilidad |

### 4.5 Arquitectura y mantenimiento

| ID | Sev. | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| **ARC-01** | Alta | Hay **dos layouts que renderizan `<html>` y `<body>`**: el raíz y el de `[locale]`. El HTML resultante está anidado e inválido, `lang` se aplica al `<html>` interno y los providers quedan dentro de un segundo `<body>`. | `app/layout.tsx:45-52`; `app/[locale]/layout.tsx:48-76` | Hidratación/SEO/accesibilidad; estructura HTML inválida |
| **ARC-02** | Media | Helpers privilegiados viven en módulos `'use server'` (`registerComposeWithoutMetadata`, `getGithubAccesToken`, `AuthWithGithub`), violando la regla del proyecto de no exportar privilegios desde actions. | `actions/userActions.ts:185`; `actions/github.ts:18,36` | Superficie de ataque y acoplamiento |
| **ARC-03** | Media | Duplicación y código muerto: `actions/exportActions.ts` ≡ `app/actions/exportActions.ts`; `searchDockerHub` y `dockerSearch`; `export-render` inalcanzable; `exportPlaygroundAsPNGToFile` sin uso. | Ver archivos citados | Mantenimiento y confusión |
| **ARC-04** | Baja | `next.config.mjs` ignora errores de tipos/lint en build y `ensureAuth` devuelve un usuario falso si `npm_lifecycle_event=build`. | `next.config.mjs:38-46`; `lib/auth.ts:13-16` | Builds “verdes” con código roto; bypass si el entorno se manipula |
| **ARC-05** | Baja | `any` abundante, ausencia de una capa de dominio para Compose/HA y `lib/metadata.ts` importa un store de cliente. | `actions/*`, `lib/metadata.ts:11,61-63` | Difícil testear en servidor; regresiones |
| **ARC-06** | Baja | No hay `audit_log`, esquema/migraciones documentadas ni runbook de backups/restauración. | — | Operación y respuesta a incidentes |

---

## 5. Diseño de corrección

El orden de las secciones es el orden de implementación recomendado. Cada diseño incluye el
contrato y los criterios de aceptación; el plan por fases está en §6.

### 5.1 Modelo de autorización y propiedad (SEC-23, SEC-24, SEC-25, ARC-02)

**Objetivo:** que ninguna acción de Docker pueda operar sobre un recurso que el usuario no
posee, y que las operaciones de host exijan rol `admin`.

**Nuevo módulo `lib/authorization.ts`** (NO `'use server'`):

```ts
export type Session = { userId: ObjectId; email: string; role: 'admin' | 'user' };

export async function requireUser(): Promise<Session> { /* jwtVerify + lookup role */ }
export async function requireAdmin(): Promise<Session> { /* role === 'admin' */ }

/** Carga el compose verificando propiedad; lanza 404 genérico si no es del usuario. */
export async function requireCompose(composeId: string, session: Session) {
  assertComposeId(composeId);
  const doc = await getDb().collection('composes').findOne({
    _id: new ObjectId(composeId), userId: session.userId,
  });
  if (!doc) throw new ActionError('COMPOSE_NOT_FOUND'); // sin filtrar si existe
  return doc;
}
```

**Reglas por acción**

| Acción | Autorización |
|---|---|
| `runCompose`, `restartCompose`, `stopCompose`, `getComposeStatus`, `getComposeLogs`, `getComposeStats` | `requireUser` + `requireCompose` |
| `shareCompose`, `deleteShareById`, `deleteCompose` | `requireUser` + propiedad (ya existe en share; aplicar a delete) |
| `getHAStatus`, `simulateFailover`, backups, pool | `requireUser` + `requireCompose` (ya existe; mantener) |
| `stopContainer`, `removeContainer`, `removeVolume`, `execDockerCommand` | `requireAdmin` + etiqueta `com.expanse.owner` o prefijo `expanse-project_`; el resto requiere `ADMIN_ALLOW_HOST_OPS=true` |
| `stopProjectByName`, `removeProjectByName` | `requireAdmin` + `project.startsWith('expanse-project_')` salvo flag explícito |
| `getGlobalDockerStats`, `getSystemInfo`, `getLocalImages`, `pullDockerImage` | `requireAdmin` (o `user` con vista de solo lectura configurable) |
| APIs CLI | `requireUser` desde el JWT; nunca aceptar `userId` del cuerpo |

**Etiquetado de despliegues:** al hacer `up`, inyectar en cada servicio:

```yaml
labels:
  com.expanse.owner: <userId>
  com.expanse.compose: <objectId>
```

Las operaciones por contenedor/volumen comprueban la etiqueta antes de actuar. Esto además
permite distinguir contenedores de Expanse de los del host en `/deploy/settings`.

**Criterios de aceptación**

- [ ] Un usuario B recibe `COMPOSE_NOT_FOUND` al invocar cualquier acción con el id de A.
- [ ] `removeProjectByName('portainer')` falla salvo admin con flag explícito.
- [ ] `execDockerCommand` exige admin y deja registro en `audit_log`.
- [ ] Tests: `tests/security/authorization.test.ts` cubre matriz completa.

### 5.2 Política de Compose seguro (SEC-22)

**Objetivo:** que el YAML que llega del cliente se valide antes de escribirse o ejecutarse.

**Nuevo módulo `lib/composePolicy.ts`** (puro, testeable sin Docker):

```ts
export type PolicyResult = { ok: true } | { ok: false; code: string; path: string; message: string };

const DENY_TOP_LEVEL = ['secrets']; // revisar caso a caso
const DENY_SERVICE_KEYS = ['privileged', 'cap_add', 'devices', 'pid', 'ipc', 'uts', 'userns_mode'];
const DENY_NETWORK_MODES = ['host', 'none']; // `service:` y `container:` permitidos con validación
const FORBIDDEN_MOUNTS = ['/', '/etc', '/root', '/home', '/var/run/docker.sock', '/proc', '/sys', '..'];

export function validateComposePolicy(doc: unknown, opts: { allowHostMounts: boolean }): PolicyResult {
  // 1. esquema con zod (services/networks/volumes objetos; keys válidas)
  // 2. denegar privileged/cap_add/devices/pid/ipc/network_mode host
  // 3. validar binds: rechazar rutas absolutas sensibles y `..`
  // 4. denegar build.context fuera de un directorio permitido (si se permite build)
  // 5. denegar `extends` a ficheros externos y `env_file` fuera del proyecto
  // 6. limitar tamaño (nº servicios, longitud de claves/valores)
}
```

**Flujo de despliegue**

```
YAML cliente
  → YAML.parse (try/catch → ACTION_ERROR)
  → validateComposePolicy (rechazo con código y ruta, sin ejecutar)
  → patchComposeYaml (nombres + healthchecks + límites)
  → normalizeComposeNames
  → docker compose config --quiet (validación real del CLI)
  → docker compose up -d
```

`docker compose config --quiet` antes de `up` convierte errores de sintaxis en mensajes
accionables y evita escribir ficheros inválidos. La política debe aplicarse también a
`restartCompose`, `validateComposePorts` y `generateHAComposeAction`.

**Criterios de aceptación**

- [ ] Un Compose con `privileged: true`, `network_mode: host`, `cap_add`, `devices` o
  `- /:/host` se rechaza con código `COMPOSE_POLICY_DENIED`.
- [ ] Tests unitarios de cada regla y de una lista de casos legítimos (WordPress + MariaDB,
  Postgres HA, bind a `./data`).
- [ ] El error mostrado al usuario es un código i18n, no el mensaje interno.

### 5.3 Endurecimiento de autenticación y sesión (SEC-21, SEC-26, SEC-27, SEC-28, SEC-29, SEC-33)

1. **Registro en un solo camino.** `registerUser` valida y crea; `createOrLoginUser` deja de
   exportarse desde `'use server'` y se mueve a `lib/authUsers.ts` (helper interno). Añadir
   comprobación de `DISABLE_SIGNUP` y rate limit por IP también en OAuth.
2. **Primer admin atómico.** Crear el admin inicial en la instalación (`pnpm create-admin`) o
   con un `insertOne` condicionado a `countDocuments()===0` + índice único en `role: admin`
   (o un lock en `settings`). Nunca decidir el rol con una lectura no atómica.
3. **Códigos CSPRNG.** `crypto.randomBytes(32).toString('base64url')`; mantener TTL y borrado
   de un solo uso. Añadir `sessionVersion` al usuario y al JWT; incrementarlo al resetear la
   contraseña y en «cerrar todas las sesiones».
4. **Rate limit correcto.** Configurar `TRUST_PROXY=true` solo detrás de proxy; si no, usar la
   IP del socket. Purgar buckets vencidos cada minuto y limitar el número de claves.
5. **API JWT.** Reutilizar `loginCredentialsSchema`, `emailSchema`, `rateLimit` y comprobar
   `user.password` antes de `bcrypt.compare`; parsear Basic Auth con
   `Buffer.from(b64,'base64').toString().split(/:(.*)/s)`.
6. **Tokens de API separados** del JWT de sesión: `scope: 'cli'`, expiración corta y
   revocables por `sessionVersion`.

**Criterios de aceptación**

- [ ] Con `DISABLE_SIGNUP=true`, ni la acción ni OAuth crean usuarios.
- [ ] `/api/auth/jwt` devuelve 429 tras N intentos y 401 uniforme.
- [ ] Reset de contraseña invalida sesiones previas (test con dos tokens).
- [ ] Dos registros concurrentes en BD vacía producen **un** admin.

### 5.4 Rediseño de alta disponibilidad (FUNC-01, FUNC-02, FUNC-03)

**Persistencia**

- Añadir a `composes`: `haConfig: DatabaseHAConfig | null`, `haEnabled: boolean`,
  `haUpdatedAt: number`.
- `runCompose`/`registerCompose` reciben `haConfig` y lo guardan con el resto del proyecto.
- `restartCompose` reutiliza la config persistida; la UI deja de ser la única fuente.

**Generador (corregir `lib/metadata.ts`)**

| Problema | Corrección |
|---|---|
| Red `overlay` | Usar `bridge` en Compose normal; `overlay` solo si `isSwarm()` |
| `5432:5432` en tres servicios | Publicar solo en HAProxy (o ninguno); usar red interna |
| Imagen `postgres` sin Patroni | Imagen `ghcr.io/zalando/patroni` (o `bitnami/patroni`) + `command` y config montada; healthcheck real |
| `depends_on: haproxy` incondicional | Generar `depends_on` según LB/pool activos |
| `deploy.placement`, `{{.Task.Slot}}` | Solo en swarm; eliminarlos en modo Compose |
| Credenciales hardcodeadas | Derivar de `POSTGRES_*` del Compose o pedirlas en el diálogo; nunca `postgres/postgres` |
| Puertos de HAProxy/PgBouncer | Asignar puertos libres con `getAvailablePort` en servidor |

**Estado y métricas**

- `getHAStatus`: indexar `docker compose ps` por campo `Service`, no por `Name`
  (`db-primary`, `db-replica`, `pgbouncer`, `haproxy`). Si no hay datos, devolver
  `unknown` explícito, no `critical`.
- Métricas: leer `SHOW STATS` de PgBouncer y parsear columnas reales; si no está disponible,
  ocultar el panel en vez de devolver ceros.
- Restauración: usar `dbUser`/`dbName` de la configuración, no constantes.

**Criterios de aceptación**

- [ ] `generateHACompose` con LB+pool+backup produce un YAML que pasa
  `docker compose config --quiet` y `docker compose up -d` en un runner sin swarm.
- [ ] Desplegar con HA, recargar la página y reiniciar conserva la configuración.
- [ ] `getHAStatus` refleja `running` cuando los contenedores están arriba.

### 5.5 Guardado, concurrencia y resiliencia (STB-13, STB-14, STB-15, STB-16, STB-17, STB-18)

1. **Control de versión optimista.** `registerCompose` recibe `expectedUpdatedAt`; el update
   usa `{ _id, userId, updatedAt: expected }`. Si `matchedCount === 0`, devolver
   `CONFLICT` (409) y ofrecer «recargar / sobrescribir / fusionar». El cliente conserva
   `updatedAt` del último guardado.
2. **Guardado fiable al cerrar.** Sustituir el `fetch` de `beforeunload` por
   `navigator.sendBeacon` a un endpoint autenticado por cookie, o mantener un borrador en
   `localStorage` y reconciliarlo al volver. Añadir estado visible
   `Guardado / Guardando / Sin guardar / Error` con hora.
3. **Screenshot bajo demanda.** No capturar el canvas en cada autoguardado: generar la
   miniatura al guardar manualmente o cada N minutos, con `pixelRatio: 1`, ancho máximo
   1600 px y límite de tamaño; si excede, omitir sin fallar el guardado.
4. **Un lock por compose.** `Map<composeId, Promise>` en el proceso (o lock en Mongo) para
   serializar Run/Restart/Stop; el botón se deshabilita mientras hay una operación.
5. **Mongo robusto.** `serverSelectionTimeoutMS: 5000`, `connectTimeoutMS: 5000`,
   `maxPoolSize` explícito. `/api/ready` comprueba Mongo (`ping`) y socket Docker
   (`docker version`), separado de `/api/ping`.
6. **Timeouts por operación.** `ps/logs/stats`: 15 s; `up/down`: configurable (10 min);
   `pull`: 30 min; exponer cancelación cuando sea posible.
7. **Límites y retención.** `deploy.resources.limits` para app y Mongo; limpieza programada de
   `/tmp/expanse-*` y `public/exports` (p. ej. 7 días); límite de tamaño por usuario.

### 5.6 Sesión y navegación en cliente (FUNC-09, FUNC-12, UX-20)

- **Eliminar `document.cookie`** como fuente de verdad. La portada y el dashboard deben
  obtener la sesión del servidor (RSC) o de un endpoint `/api/session` que devuelva
  `{ authenticated, email }` sin leer el token.
- **Un solo dashboard.** Extraer `ProjectList` y `ProjectHeader` compartidos; la portada puede
  ser pública con CTA, o redirigir en servidor a `/dashboard` si hay sesión.
- **Logout único.** Llamar siempre a `logout()` (Server Action), que borra la cookie con
  `cookies().delete` y redirige. Eliminar el borrado manual de `document.cookie`.
- **Preservar destino.** Al redirigir a login desde una ruta protegida, conservar
  `?next=`/`?data=` y restaurarlo tras autenticar.

### 5.7 UX, accesibilidad e i18n (UX-13 a UX-21)

- **Confirmaciones reales:** diálogo con nombre del recurso e impacto; «Cancelar» aborta la
  acción. Separar «borrar fichero» de «detener/eliminar despliegue» y explicar la diferencia.
  No borrar volúmenes sin checkbox explícito.
- **i18n:** mover las cadenas de `settings`, `playground`, `composeRow`, `projectMonitor` y
  errores a `messages/{en,es}.json`; los Server Actions devuelven códigos, el cliente traduce.
- **Accesibilidad:** `aria-label` en todos los botones solo-icono, `aria-live` para estado de
  deploy, foco visible, navegación por teclado en el canvas, contraste ≥ 4.5:1 y
  `prefers-reduced-motion`.
- **Feedback de deploy:** fases (`validando → escribiendo → arrancando → listo`), resumen de
  puertos reasignados antes de confirmar y enlace a logs en el error.
- **Share seguro:** advertencia explícita de que el enlace incluye variables de entorno;
  opción «ocultar valores sensibles» en el YAML público; botón de revocar; caducidad y token
  firmado (P2).
- **Stubs:** eliminar o marcar claramente como «próximamente» y deshabilitar el botón
  (Google Drive, nodos remotos, pool metrics, reapply limits).

### 5.8 Observabilidad y operación (STB-19, STB-21, ARC-06)

- Logger JSON con nivel, `requestId`, `userId` hash y redacción de claves
  (`password`, `token`, `secret`, `DATABASE_URL`).
- `audit_log`: `userId`, acción, recurso, resultado, IP y timestamp para login, deploy,
  borrados, failover/restore y operaciones de host.
- `/api/ready` + healthcheck del compose que lo use.
- Runbook de backup/restauración de Mongo y rotación de `SECRET_KEY`.

### 5.9 Limpieza técnica (ARC-01 a ARC-05, FUNC-14)

- **Un solo `<html>`/`<body>`.** Dejar `app/layout.tsx` con `<html lang>` (obtenido del
  segmento) y `<body>`; `app/[locale]/layout.tsx` solo con providers. Alternativa: mover
  providers al layout raíz con `getLocale()`.
- Mover helpers privilegiados fuera de `'use server'`: `lib/authUsers.ts`, `lib/github.ts`.
- Eliminar `actions/exportActions.ts` duplicado, `export-render` inalcanzable,
  `exportPlaygroundAsPNGToFile` sin uso y unificar `searchDockerHub`/`dockerSearch`.
- Corregir la comprobación de versión a `Dinamicas-Electronicas/expanse` o eliminarla.
- Quitar `ignoreBuildErrors`/`ignoreDuringBuilds` cuando CI esté verde; eliminar el stub de
  `ensureAuth` en build usando datos de prueba explícitos.
- Cachear la biblioteca (142 JSON) en memoria con invalidación por `mtime`.

---

## 6. Plan de implementación

### P0 — bloquea exponer la instancia a Internet

| # | Tarea | IDs | Esfuerzo | Criterio de aceptación |
|---|---|---|---|---|
| 1 | Autorización por recurso + RBAC + etiquetas de propiedad | SEC-23/24/25 | M | Un usuario no opera recursos ajenos; tests de matriz |
| 2 | Política de Compose + `docker compose config` previo | SEC-22 | M | Casos peligrosos rechazados; stacks legítimos pasan |
| 3 | Cerrar registro y endurecer auth/API/reset | SEC-21/26/27/28/33 | M | `DISABLE_SIGNUP` efectivo en todos los caminos; 429; sesión revocada |
| 4 | Corregir portada/logout y sesión cliente | FUNC-09 | S | Portada lista proyectos; logout cierra sesión |
| 5 | Persistir HA y arreglar generador/estado | FUNC-01/02/03 | L | `up -d` HA funciona y sobrevive a recarga/reinicio |
| 6 | Confirmaciones destructivas | UX-13/FUNC-06/07 | S | Cancelar aborta; borrado pide confirmación |
| 7 | Telemetría opt-in, versión correcta, CSP | SEC-32/36 | S | Sin peticiones a terceros salvo consentimiento; CSP activa |

### P1 — siguiente iteración (2–4 semanas)

| # | Tarea | IDs |
|---|---|---|
| 8 | Concurrencia de guardado + `sendBeacon` + estado de guardado | STB-13 |
| 9 | Mongo con timeouts, `/api/ready` y logs estructurados | STB-14/19/21 |
| 10 | Puertos: parseo completo, reservas y verificación en host | FUNC-04 |
| 11 | Polling con visibilidad/backoff y estado `isExecuting` derivado | FUNC-05/STB-18 |
| 12 | Un lock por deploy y timeouts por operación | STB-16/17 |
| 13 | i18n de cadenas restantes + accesibilidad + contraste | UX-14/21 |
| 14 | Share con advertencia/revocación/redacción; stubs deshabilitados | SEC-30/UX-16/UX-17 |
| 15 | Correcciones puntuales: email, image refs, revalidate, resetCompose, CLI API | FUNC-08/10/11/12/13 |
| 16 | Limpieza ARC y duplicados; un layout raíz | ARC-01/02/03 |
| 17 | Tests E2E Playwright (login→crear→guardar→deploy→share) | STB-20 |

### P2 — madurez

| # | Tarea | IDs |
|---|---|---|
| 18 | `sessionVersion`, logout global, MFA TOTP opcional | SEC-28 |
| 19 | Shares con token firmado, caducidad y contraseña | SEC-30 |
| 20 | `audit_log` + alertas (401/429, 5xx, `exec`) | ARC-06 |
| 21 | Límites de recursos, retención de exports/temporales, cuotas | STB-15 |
| 22 | Socket proxy/rootless y separación del proceso web | SEC-24 |
| 23 | Migraciones de esquema + backup/restore probado | STB-22/ARC-06 |

---

## 7. Plan de pruebas y criterios de aceptación

### 7.1 Tests nuevos obligatorios

| Archivo | Cubre |
|---|---|
| `tests/security/authorization.test.ts` | Matriz usuario A/B/admin para cada acción Docker y de compose |
| `tests/lib/composePolicy.test.ts` | `privileged`, `cap_add`, `devices`, `network_mode`, mounts sensibles, build, casos válidos |
| `tests/security/auth.test.ts` | `DISABLE_SIGNUP` en acción y OAuth, rate limit, reset CSPRNG, revocación de sesión, admin único |
| `tests/integration/haCompose.test.ts` | `generateHACompose` → `docker compose config --quiet` y `up -d` sin swarm; estado por `Service` |
| `tests/lib/ports.test.ts` | Formatos `IP:host:container`, `/tcp`, rangos, reservas y no-duplicados |
| `tests/lib/session.test.ts` (ampliar) | `sessionVersion`, cookie `__Host-` en HTTPS, revocación |
| `tests/e2e/*.spec.ts` (Playwright) | Registro, guardado, recarga, deploy, share, logout |

### 7.2 Definición de «corregido»

Un hallazgo se cierra solo si:

1. Existe un test que falla antes y pasa después (regresión).
2. El mensaje al usuario es un código i18n, no un texto interno.
3. Se registra en `audit_log` si es una operación sensible.
4. `pnpm typecheck && pnpm lint && pnpm test && pnpm audit` siguen verdes.
5. La documentación (`docs/SDD.md`, `README`, `CHANGELOG`) se actualiza.

### 7.3 Pruebas de seguridad y caos pendientes

- **ZAP baseline** sobre una instancia sembrada (XSS, CSRF, headers, open redirects).
- **k6**: deploy concurrente, body de 4 MB, rate limit, 142 plantillas.
- **Caos**: Mongo caído 30 s; Docker daemon caído; recuperación sin reinicio.
- **Abuso**: intento de montar el socket, `privileged`, borrar proyectos del host,
  invocar acciones con IDs ajenos.

---

## 8. Riesgos y decisiones abiertas

1. **Producto mono-operador vs multi-tenant.** Todo el modelo P0 asume que autenticarse =
   root. Si se quiere multi-tenant real, hacen falta socket proxy, contenedores rootless por
   usuario y cuotas (esfuerzo alto, P2).
2. **Compartir secretos.** Se propone advertir y permitir redactar valores; la alternativa es
   prohibir compartir stacks con variables sensibles.
3. **Alcance de HA.** El generador actual promete Patroni/etcd/HAProxy; se puede (a) repararlo
   o (b) retirarlo de la UI hasta que esté probado. Recomendado: repararlo con tests reales.
4. **Telemetría.** `opentech-ux.org` debe ser opt-in explícito; PostHog ya está detrás de
   `DISABLE_TELEMETRY`.
5. **Contraseñas existentes.** Mantener login con mínimo 6 para cuentas antiguas, pero elevar
   el hash a bcrypt coste 12 en el próximo cambio de contraseña.
6. **Compose `deploy:` en no-swarm.** Docker Compose ignora `deploy.replicas` sin swarm;
   documentarlo o usar `--compatibility`/swarm según el caso.

---

## 9. Anexo A — Matriz actual de acciones y APIs

| Endpoint / acción | Auth actual | Ownership | Admin | Objetivo |
|---|---|---|---|---|
| `createOrLoginUser` | — (crea usuario) | — | — | Solo login; registro interno |
| `registerUser` | — | — | — | `DISABLE_SIGNUP` + rate limit |
| `loginUser` | — | — | — | Rate limit + email normalizado |
| `getAllMyComposeOrderByEditDate` | ✅ | ✅ | — | OK |
| `getComposeById` | ✅ | ✅ | — | Validar ObjectId |
| `registerCompose` | ✅ | ✅ | — | Versión optimista |
| `deleteCompose` | ✅ | ✅ | — | Confirmar, cascada, validar |
| `deleteUser` | ✅ | ✅ | — | Reauth + cascada + sin redirect externo |
| `runCompose` | ✅ | ❌ | — | Ownership + política + lock |
| `stopCompose` / `restartCompose` | ✅ | ❌ | — | Ownership |
| `getComposeStatus` / `getComposeLogs` | ✅ | ❌ | — | Ownership |
| `stopProjectByName` / `removeProjectByName` | ✅ | ❌ | ❌ | Admin + prefijo/label |
| `stopContainer` / `removeContainer` / `removeVolume` | ✅ | ❌ | ❌ | Admin + label |
| `execDockerCommand` | ✅ | ❌ | ❌ | Admin + audit |
| `getGlobalDockerStats` / `getSystemInfo` | ✅ | — | ❌ | Admin o solo lectura |
| `shareCompose` | ✅ | ✅ | — | Advertencia + revocación |
| `getComposeByShareId` | público | — | — | Público por diseño |
| `getAllMyShares` / `deleteShareById` | ✅ | ✅ | — | OK |
| Acciones HA | ✅ | ✅ | — | Persistir config |
| `getGithubAccesToken` | **público** | — | — | Mover a `lib/` |
| `AuthWithGithub` | **público** | — | — | Mover a `lib/`/rate limit |
| `/api/auth/jwt` | credenciales | — | — | Rate limit + parseo |
| `/api/compose` GET | público (share) | — | — | OK; redactar secretos |
| `/api/compose` POST / `machine` | JWT | ⚠️ userId del body (helper) | — | Derivar del token + validar |
| `/api/export/png` | público (share) | — | — | OK |
| `/api/logos/library/[name]` | público | — | — | OK (allowlist) |

---

## 10. Anexo B — Reproducción de la verificación

```bash
# Calidad (estado actual: todo verde)
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --audit-level=high

# Pruebas que debe añadir el plan (§7)
pnpm vitest run tests/security tests/lib/composePolicy.test.ts tests/lib/ports.test.ts
pnpm test:docker          # plantillas reales
docker compose config --quiet  # sobre el YAML generado por HA
```

**Evidencias clave** (archivo:línea):

- `actions/userActions.ts:33-82` — registro sin gate ni rate limit.
- `actions/dockerActions.ts:37-190` — YAML sin política.
- `actions/dockerActions.ts:193-341` — acciones de proyecto sin ownership.
- `actions/dockerActions.ts:553-655,775-791` — operaciones de host sin RBAC.
- `actions/userActions.ts:185-198` — `userId` como parámetro público.
- `actions/github.ts:18-34` — token OAuth devuelto por una action.
- `actions/databaseHA.ts:384-386,424-470` — HA inalcanzable/estado erróneo.
- `lib/metadata.ts:492-663` — Compose HA no ejecutable en no-swarm.
- `app/[locale]/page.tsx:38-42,141-147` — sesión `HttpOnly` y logout rotos.
- `app/layout.tsx:45-52` + `app/[locale]/layout.tsx:48-76` — `<html>` anidado.
- `lib/utils.ts:50-58,89-90` — `Math.random` y repositorio de versión incorrecto.
- `lib/rateLimit.ts:13,47-52` — rate limit spoofeable/sin purga.

---

*Documento vivo. Toda decisión sobre registro público, compartición de secretos, HA o
multi-tenant debe actualizar §7 y §8 antes de desplegar.*
