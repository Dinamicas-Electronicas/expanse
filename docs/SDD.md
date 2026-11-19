# SDD — Usabilidad, Estabilidad y Seguridad

| Campo | Valor |
|---|---|
| Proyecto | Expanse (IDE visual para Docker Compose) |
| Versión analizada | `1.1.5` + cambios sin publicar (`next 15.5.29`, `pnpm 12.3.4`) |
| Fecha | 19 de noviembre de 2026 |
| Alcance | Aplicación completa: UI de playground/dashboard, Server Actions, API routes, middleware, despliegue Docker y persistencia MongoDB |
| Método | Revisión estática + ejecución real (contenedor `expanse:local`, MongoDB, Docker Engine 29) + pruebas dinámicas de Server Actions y APIs |

---

## 1. Resumen ejecutivo

La aplicación funciona en el camino feliz (arranque, login, listado, despliegue de stacks), pero la auditoría encontró **dos vulnerabilidades críticas explotables sin autenticación** y **un fallo de usabilidad que rompía el flujo principal de guardado**. Las tres están corregidas en este cambio y cubiertas con pruebas.

| Área | Estado inicial | Estado tras este cambio |
|---|---|---|
| Seguridad | 2 críticas, 6 altas, 6 medias | Críticas cerradas; quedan riesgos **de arquitectura** (socket Docker, telemetría externa) documentados con plan |
| Estabilidad | Crash del dashboard con proyectos, carrera de guardado, límite de 1 MB | Corregidos; quedan mejoras de concurrencia/observabilidad planificadas |
| Usabilidad | Guardar mostraba un registro a usuarios ya logueados; sin estados de error globales | Corregido el flujo de guardado; añadidos `error.tsx`/`not-found.tsx`; quedan i18n y accesibilidad |

**Riesgo residual más importante:** el contenedor corre como `root` con `/var/run/docker.sock` montado y el registro público está habilitado por defecto. Cualquier persona que cree una cuenta obtiene, por diseño, control equivalente a root sobre el host. Se detalla en SEC-13 y requiere una decisión de producto (SEC-13 es P0 para instancias expuestas a Internet).

---

## 2. Alcance y método de verificación

### 2.1 Pruebas ejecutadas

```bash
pnpm typecheck          # OK
pnpm lint               # 0 errores (6 warnings de fast-refresh)
pnpm test               # 86 tests: 84 OK, 2 smoke opt-in
pnpm audit --audit-level=low   # 0 advisories
docker compose build app       # OK
docker compose up -d           # db healthy + app healthy
curl /api/ping                 # 200
```

Se ejecutaron además pruebas **dinámicas contra el contenedor real**:

- invocación de Server Actions con y sin sesión (cabecera `Next-Action`);
- APIs con IDs malformados, shares huérfanos y shares válidos;
- cabeceras `Set-Cookie` reales de login;
- recorrido de rutas con locales no soportados;
- validación del YAML generado con `docker compose config` y `docker compose up -d`.

### 2.2 Evidencias (resumen)

| Prueba | Resultado observado |
|---|---|
| POST Server Action `getComposeByIdPublic` sin cookie | Devolvió datos del proyecto **incluyendo variables de entorno con contraseñas** |
| POST `createOrLoginUser(email víctima, {external:"github", password:"incorrecta"})` | `200` + `Set-Cookie: token=…` (sesión válida) |
| POST `registerUser` con password `"123"` y email inválido | Usuario creado + cookie de sesión |
| `Set-Cookie` del login | `token=…; Path=/; HttpOnly` — **sin `SameSite` ni `Secure`** |
| `GET /api/export/png?shareId=<share válido>` | `404 {"error":"Share not found"}` (consultaba la BD `compose_craft`) |
| `GET /api/export/png?shareId=nope` | `500` + mensaje interno de BSON |
| `GET /api/compose?id=nope` | `500` |
| `GET /fr/dashboard` y `/fr/deploy/settings` sin sesión | `200` (bypass del middleware) |
| `GET /api/logos/library/..%2Ftimescaledb` | `404` (traversal no explotable, pero sin allowlist) |
| Índices MongoDB | Solo `_id_` en `users`, `composes`, `shares` |

> Las pruebas se hicieron contra una instancia local del propio operador. No se modificó ni eliminó ningún dato suyo; los usuarios/shares de prueba se borraron al terminar.

---

## 3. Arquitectura actual (contexto)

```
┌──────────────────────────── Navegador ────────────────────────────┐
│  Next.js App Router (client components)                           │
│  Zustand (compose, HA, execution)  ·  React Flow  ·  Monaco/xterm │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ RSC / Server Actions          │ fetch APIs
┌───────────────┴───────────────────────────────▼───────────────────┐
│  Next.js standalone (Node 24, contenedor root)                    │
│  middleware.ts  → next-intl + verificación JWT                    │
│  actions/*      → Server Actions (ensureAuth)                     │
│  app/api/*      → API routes (JWT propio o público por diseño)    │
│  lib/dockerExec → execFile(docker …)  (sin shell)                 │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ MongoDB (db: expanse)          │ /var/run/docker.sock
┌───────────────┴───────────────┐   ┌────────────▼───────────────────┐
│ users · composes · shares     │   │ Docker Engine del host         │
│ reset_code · csrf_token       │   │ contenedores de todos los users│
└───────────────────────────────┘   └────────────────────────────────┘
```

**Límites de confianza**

1. Navegador → servidor: no confiable. Toda acción debe autenticar y autorizar.
2. Servidor → Docker: **privilegiado** (root + socket). Cualquier función que acepte nombres/IDs de Docker es una operación de administrador.
3. Servidor → MongoDB: confiable; el aislamiento entre usuarios depende de filtros en cada consulta.
4. Servidor → Internet: telemetría de terceros (`opentech-ux.org`) y GitHub/Brevo.

---

## 4. Hallazgos y estado

Escala: **Crítica** (compromiso total / pérdida de datos), **Alta** (acceso cruzado, bypass de auth, feature rota), **Media** (impacto limitado o requiere condiciones), **Baja** (endurecimiento).

### 4.1 Seguridad

| ID | Sev. | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|
| SEC-01 | Crítica | **Account takeover** en la Server Action `createOrLoginUser`: si el payload incluía `external`, se omitía la verificación de contraseña. | Sesión emitida con contraseña incorrecta | **Corregido.** `createOrLoginUser` solo acepta contraseña; OAuth usa `lib/oauth.ts` (no es Server Action). Test: `tests/actions/auth.test.ts` |
| SEC-02 | Crítica | **Lectura no autenticada de cualquier compose** vía `getComposeByIdPublic` (Server Action). Exponía servicios, variables de entorno y credenciales. | Payload con `MYSQL_ROOT_PASSWORD` y `MYSQL_PASSWORD` | **Corregido.** `ensureAuth()` + filtro `userId`; el id del proyecto ya no es una capability |
| SEC-03 | Alta | **Registro sin validación server-side**: email inválido, contraseña `"123"`, términos sin aceptar; sin límite de intentos. | Usuario creado con `role=user` | **Corregido.** `lib/validation.ts` + límite 5/h por IP. Política nueva: 8–100 caracteres |
| SEC-04 | Alta | **Sin rate limiting** en login, `/api/auth/jwt` (Basic Auth), reseteo y token CLI. Permite fuerza bruta y abuso de correo. | Revisión de código | **Mitigado.** `lib/rateLimit.ts` (ventana fija en memoria). Pendiente: almacén compartido (Redis) para multi-réplica |
| SEC-05 | Alta | **Cookie de sesión sin `SameSite` ni `Secure`** ni expiración alineada explícita. | `Set-Cookie` real | **Corregido.** `lib/session.ts`: `HttpOnly`, `SameSite=Lax`, `Secure` automático si `URL` es HTTPS |
| SEC-06 | Alta | **IDOR al compartir**: `shareCompose` creaba un enlace público para cualquier `composeId` sin comprobar propiedad. | Revisión de código | **Corregido.** Verificación de propiedad antes de insertar el share |
| SEC-07 | Alta | **IDOR en operaciones HA**: `getHAStatus`, `simulateFailover`, `triggerBackup`, `listBackups`, `restoreBackup`, `getPoolMetrics`, `updatePoolConfig` buscaban el compose solo por `_id`. | Revisión de código | **Corregido.** Todas las consultas/actualizaciones filtran por `userId` |
| SEC-08 | Media | **Server Actions sin autenticación**: `getLocalSystemInfo` (revelaba IPs internas) y `saveRemoteNodeConfig` (credenciales de nodos remotos). | `200` con IP interna sin sesión | **Corregido.** `ensureAuth()` en ambas |
| SEC-09 | Alta | **Secretos en logs**: `console.log(ghToken)` (token OAuth de GitHub), URL de reseteo con código en claro y código en consola del navegador. | Revisión de código | **Corregido.** Logs eliminados/redactados. **Rotar el token de GitHub si los logs se conservaron** |
| SEC-10 | Alta | **Bypass de middleware por locale no soportado**: `/fr/dashboard` y `/fr/deploy/settings` evitaban el matcher y se servían sin sesión. | `200` sin sesión | **Corregido.** Validación de locale + matcher recomendado por next-intl |
| SEC-11 | Media | `/deploy/settings` no estaba en las rutas protegidas por middleware (solo acciones protegidas). | `200` sin sesión | **Corregido.** Añadido prefijo `/deploy` |
| SEC-12 | Media | **Sin cabeceras de seguridad** (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS condicional). | `curl -I` sin cabeceras | **Corregido parcialmente.** `next.config.mjs`; CSP pendiente (requiere nonces) |
| SEC-13 | Alta\* | **Socket Docker + contenedor root + registro público**: toda cuenta autenticada puede parar/borrar contenedores y volúmenes de cualquier proyecto y ejecutar comandos arbitrarios (`execDockerCommand`). Además permite montajes de rutas del host (`/`, `/etc`, socket) en stacks desplegados. | Revisión de código y diseño | **Abierto (decisión de producto).** Plan en §7.5 |
| SEC-14 | Alta | **Script de terceros** `opentech-ux.org` cargado con `beforeInteractive` sin SRI cuando `DISABLE_TELEMETRY` no está definido. | `components`/layout | **Abierto.** Recomendado: eliminar o hacer opt-in + SRI |
| SEC-15 | Media | **Sesiones no revocables**: JWT de 30 días, sin lista de revocación; cambiar la contraseña no invalida sesiones; sin MFA. | Revisión de código | **Abierto.** Plan §7.4 |
| SEC-16 | Media | **Token CLI en query string** (`http://localhost:5555?token=…`): queda en historial, logs y cualquier proceso local que escuche el puerto. | Revisión de código | **Abierto.** Recomendado: POST con cuerpo + callback con nonce |
| SEC-17 | Alta | **`/api/export/png` consultaba la base `compose_craft`** en vez de `expanse` (la feature nunca funcionó), devolvía `500` con detalle interno para IDs inválidos y no verificaba `access`. | `404 Share not found` con share válido; `500` con `BSONError` | **Corregido.** `getDb()`, validación de ObjectId, solo shares públicos, errores genéricos |
| SEC-18 | Baja | `/api/compose` devolvía `500` con ID inválido. | `500` | **Corregido.** `400` + validación |
| SEC-19 | Baja | `/api/logos/library/[name]` sin allowlist de nombre. El traversal no fue explotable, pero no había defensa en profundidad. | Pruebas con `%2F` | **Corregido.** Regex `^[a-z0-9][a-z0-9-]{0,62}$` + comprobación de contención |
| SEC-20 | Media | **Sin índices**: `users.email` no era único (cuentas duplicadas en concurrencia), `reset_code`/`csrf_token` crecían sin TTL y las consultas por usuario escaneaban la colección. | `getIndexes()` = solo `_id_` | **Corregido.** `lib/dbIndexes.ts` (bootstrap idempotente con TTL) |

\* SEC-13 es Alta en una instalación mono-operador y **Crítica** si la instancia está expuesta con registro abierto.

### 4.2 Usabilidad

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| UX-01 | Crítica | **El dashboard no listaba proyectos**: `console.log(..., data.length)` dentro del propio `map` de `data` lanzaba `ReferenceError` (TDZ); el `catch` redirigía a `/login`. Solo funcionaba con 0 proyectos. | **Corregido** (`app/[locale]/page.tsx`) |
| UX-02 | Alta | **Guardar mostraba el formulario de registro a usuarios autenticados**: el store `disabled` empieza en `true` y nadie lo activaba tras un login normal. Autoguardado efectivamente desactivado. | **Corregido.** El playground consulta la sesión y habilita guardado/autoguardado |
| UX-03 | Alta | **Riesgo de pérdida de datos**: el guardado en `beforeunload` es asíncrono y el navegador no garantiza su finalización; sin indicador de estado ni bloqueo de navegación. | **Parcial.** Autoguardado restaurado; pendiente `sendBeacon` + indicador |
| UX-04 | Media | Compartir un proyecto inexistente/borrado mostraba un canvas vacío sin explicación. | **Corregido** (estado "Shared project not found") |
| UX-05 | Media | Sin `error.tsx`/`not-found.tsx` globales y el boundary de share mostraba `error.message` (detalles internos). | **Corregido.** Páginas propias y mensajes genéricos con `digest` |
| UX-06 | Media | Cadenas hardcodeadas en inglés dentro de una app bilingüe; `/fr` aceptaba un locale inexistente (contenido en inglés y `lang="fr"`). | **Parcial.** Locale validado; i18n pendiente |
| UX-07 | Media | Accesibilidad: 0 `aria-label`, 3 `<img>` sin `alt`, botones solo-icono sin nombre accesible, sin foco visible homogéneo. | **Abierto** |
| UX-08 | Media | Confirmaciones inconsistentes; la "puerta" de contraseña de operaciones destructivas es solo cliente (las acciones no la exigen). | **Abierto** |
| UX-09 | Baja | Feedback de despliegue poco accionable (fase + toast); los puertos se reasignan automáticamente sin confirmación. | **Abierto** |
| UX-10 | Baja | `login/cli` no explica el flujo ni el estado; token en URL. | **Abierto** |
| UX-11 | Media | `saveRemoteNodeConfig` y `exportToGoogleDrive` son stubs que devuelven éxito/"coming soon" y aparentan funcionalidad. | **Abierto** |
| UX-12 | Baja | El nombre de volumen se sanea en silencio; el usuario no ve el nombre final. | **Abierto** |

### 4.3 Estabilidad

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| STB-01 | Alta | **Carrera de autoguardado entre proyectos**: el debounce guardaba con el `id` actual, no con el del proyecto editado; cambiar de proyecto en <2 s podía sobrescribir otro proyecto. | **Corregido.** El `id` se captura al programar el guardado y se cancela al cambiar/resetear |
| STB-02 | Alta | **Límite de 1 MB por Server Action**: el guardado adjunta un PNG en base64; diagramas grandes fallaban con un error genérico. | **Corregido.** `serverActions.bodySizeLimit = 4mb` |
| STB-03 | Alta | `generateHAComposeAction` leía `doc.compose` (campo inexistente; los composes se guardan en `data`). | **Corregido** |
| STB-04 | Media | Guardado **last-write-wins** sin control de versión: dos pestañas pueden sobrescribirse. | **Abierto.** Plan §6.3 |
| STB-05 | Media | MongoDB sin `serverSelectionTimeoutMS`/retry: si la BD cae, las peticiones esperan ~30 s y devuelven errores genéricos. | **Abierto** |
| STB-06 | Media | Sin índices ni TTL (duplicados de email, colecciones creciendo). | **Corregido** (`lib/dbIndexes.ts`) |
| STB-07 | Media | Sin límites de recursos en `docker-compose.yml` (app/db) ni `mem_limit`; un stack grande puede agotar el host. | **Abierto** |
| STB-08 | Media | `/tmp/expanse-*` y `public/exports` sin retención; los logs de docker se acumulan en `/tmp` del contenedor. | **Abierto** |
| STB-09 | Baja | Múltiples pollers (3 s / 5 s / 10 s) sin backoff ni pausa en pestaña oculta. | **Abierto** |
| STB-10 | Baja | El layout consulta la última versión en GitHub en cada arranque (con presupuesto de 2 s) y carga telemetría externa bloqueante. | **Abierto** |
| STB-11 | Baja | Logs no estructurados: `console.log` de la salida de Docker, sin niveles ni redacción. | **Abierto** |
| STB-12 | Baja | Sin pruebas E2E de UI (login→crear→guardar→desplegar→compartir). | **Abierto** |

---

## 5. Diseño de usabilidad

### 5.1 Objetivos

1. **Nunca perder trabajo.** El estado del proyecto debe ser explícito y recuperable.
2. **Nunca mentir al usuario.** Si una acción falla, decir qué falló y cómo recuperarse; no mostrar diálogos de registro a quien ya inició sesión.
3. **Consistencia bilingüe (es/en)** y accesibilidad WCAG 2.1 AA en los flujos principales.
4. **Previsibilidad en operaciones destructivas**: confirmación explícita, reautenticación y resumen de impacto.

### 5.2 Flujo de guardado (diseño propuesto)

Estado del proyecto en el playground:

```
[Sin sesión] --editar--> [Borrador local]
     |                        |
     |-- Guardar --> Diálogo de registro/login (embebido, con "Ya tengo cuenta" visible)
     |
[Con sesión] --editar--> [Cambios sin guardar] --2 s--> [Guardando] --> [Guardado]
                               |                              |
                               |                              +--> error: [Reintentar] + detalle
                               +--> navegar: confirmación explícita (no beforeunload)
```

Requisitos:

- Indicador persistente `Guardado / Guardando… / Sin guardar / Error` con hora del último guardado.
- Cancelación del debounce al cambiar de proyecto (implementado) y **control de versión**: enviar `updatedAt` esperado; el servidor rechaza (`409`) si cambió (pendiente).
- `beforeunload` con `fetch(..., {keepalive:true})` o `navigator.sendBeacon` (pendiente).
- Autoguardado activo por defecto para usuarios autenticados (implementado).
- Recuperación de borrador en `localStorage` si se cierra la pestaña sin sesión (propuesta).

### 5.3 Mensajes y estados

| Situación | Patrón |
|---|---|
| Error de validación | Mensaje junto al campo (no toast), con el texto del esquema |
| Error de red/acción | Toast + panel con "Reintentar" y referencia (`digest`) |
| Operación larga (deploy) | Fases (`validando → escribiendo → arrancando → listo`) + acceso a logs |
| Recurso inexistente | Página/estado dedicado con acción de salida (implementado en share) |
| Sesión expirada | Redirigir a login preservando `?next=` (hoy se pierde el destino) |

### 5.4 Internacionalización

- Regla: ninguna cadena visible hardcodeada. Claves en `messages/{en,es}.json`.
- Los mensajes de error de Server Actions deben devolver **códigos**, no texto en inglés, y traducirse en el cliente.
- Validar el locale en middleware (implementado) y usar `<html lang>` correcto.

### 5.5 Accesibilidad

- `aria-label` en todos los botones solo-icono; `alt` descriptivo en imágenes.
- Foco visible, navegación completa por teclado en canvas (selección, mover nodo, abrir panel).
- Contraste mínimo 4.5:1 en texto pequeño (varios `text-slate-500` sobre fondo oscuro están por debajo).
- Respetar `prefers-reduced-motion` en animaciones del playground.

### 5.6 Operaciones destructivas

- Diálogo con nombre del recurso, impacto ("se borrarán 3 volúmenes"), checkbox de confirmación.
- **Reautenticación server-side** (`verifyUserPassword` dentro de la acción) para borrar proyectos/volúmenes y para `failover`/`restore`.
- Etiquetar claramente qué contenedores pertenecen a Expanse y cuáles son del host.

### 5.7 Criterios de aceptación (UX)

- [x] Un usuario autenticado puede guardar sin ver formularios de registro.
- [x] El dashboard lista proyectos existentes sin redirigir a login.
- [x] Compartir un recurso borrado muestra un estado claro.
- [ ] Cobertura i18n: 0 cadenas hardcodeadas en flujos principales.
- [ ] 0 violaciones críticas de axe-core en login, dashboard y playground.
- [ ] Prueba E2E de guardado y recuperación tras recarga.

---

## 6. Diseño de estabilidad

### 6.1 Modelo de fallos

| Componente | Fallo | Comportamiento actual | Objetivo |
|---|---|---|---|
| MongoDB | Caída | Peticiones lentas (30 s) y error genérico | Timeout 5 s, reintento acotado, mensaje "base de datos no disponible" |
| Docker daemon | Caída | Error de acción con mensaje de docker | Estado degradado visible, sin reintentos infinitos |
| Docker command | Timeout | 30 min (nuevo) | Timeout configurable por operación + cancelación |
| Server Action | Payload > límite | Error genérico | Límite 4 MB (hecho) + compresión/recorte de screenshot |
| Navegador | Cierre | Guardado asíncrono puede perderse | `keepalive`/`sendBeacon` |
| Two tabs | Edición concurrente | Sobrescritura silenciosa | Control de versión (`409` + merge manual) |
| Disco | `/tmp`, exports | Crecimiento ilimitado | Retención + limpieza periódica |

### 6.2 Integridad de datos

- Índices y unicidad: `users.email` único, TTL en `reset_code`/`csrf_token` (implementado).
- Toda consulta de un recurso de usuario incluye `userId` (composes, shares, HA).
- Guardado con **versión optimista**: `updateOne({_id, userId, updatedAt: expected})`; si `matchedCount=0` → `409 Conflict`.
- Migración recomendada: normalizar emails a minúsculas **antes** de desplegar el índice único en bases con datos previos.
- Backup: documentar `mongodump` diario y probar restauración (hoy no hay estrategia).

### 6.3 Concurrencia y trabajos en segundo plano

- Polling con backoff exponencial, pausa con `document.hidden` y un único intervalo por dominio.
- Icon sync: intervalo de 24 h sin `unref` (mantiene el proceso despierto, irrelevante en servidor).
- Deploy: operaciones idempotentes (`up -d` es idempotente) y bloqueo por compose para evitar dobles clics concurrentes.
- Registro de operaciones: tabla/colección `audit_log` con `userId`, acción, recurso, resultado.

### 6.4 Observabilidad

- Logs JSON con nivel, `requestId`, `userId` (hash) y redacción de secretos.
- `/api/ping` (liveness) + `/api/ready` (comprueba Mongo y socket Docker).
- Métricas: latencia de acciones, errores por acción, duración de deploys, tamaño de screenshots.

### 6.5 Límites y capacidad

- Añadir `deploy.resources.limits` al compose de la app y de Mongo; `mem_limit` como red de seguridad.
- Limitar tamaño del screenshot (p. ej. 1600×1000 y `toPng` con `pixelRatio: 1`).
- Limitar número de stacks/volúmenes por usuario en despliegues multi-tenant.

### 6.6 Criterios de aceptación (estabilidad)

- [x] Dashboard lista proyectos con datos existentes.
- [x] Cambiar de proyecto no puede escribir en el proyecto nuevo.
- [x] Guardados grandes (>1 MB) funcionan.
- [x] Índices/TTL creados al arrancar.
- [ ] Prueba de caos: Mongo caído 30 s y recuperación sin reinicio.
- [ ] Prueba de concurrencia: dos pestañas editando el mismo proyecto → `409` y merge.
- [ ] Retención de exports y `/tmp` implementada.

---

## 7. Diseño de seguridad

### 7.1 Modelo de amenazas

| Actor | Capacidad | Objetivo |
|---|---|---|
| Anónimo en Internet | Sin cuenta | Leer datos privados, crear cuentas, DoS |
| Usuario autenticado | Cuenta propia | Leer/escribir proyectos ajenos, ejecutar comandos en el host |
| Operador legítimo | Admin del host | Gestionar stacks |
| Cadena de suministro | Dependencia/script comprometido | Ejecución de código en el servidor o en el navegador |

**Supuesto clave:** la app es, por diseño, **una consola de administración de Docker**. Autenticarse = poder de root sobre el host (socket). Por tanto, "registro público" y "multi-tenant" no son compatibles sin un rediseño de aislamiento.

### 7.2 Autenticación y sesión

Estado actual (tras los cambios):

- JWT HS256 firmado con `SECRET_KEY`, 30 días, cookie `HttpOnly; SameSite=Lax; Secure` (si HTTPS).
- `ensureAuth()` en acciones; middleware valida en rutas de página.
- Login/registro/reset con límite en memoria.

Diseño objetivo:

1. **Sesiones revocables**: campo `sessionVersion` en `users`; el JWT lo incluye y middleware/acciones lo comparan (permite logout global y revocar tras cambio de contraseña).
2. **Duración**: access token 12 h + refresh rotatorio 30 días; cookie `__Host-token` (HTTPS).
3. **MFA TOTP** opcional para el primer usuario/admin.
4. **Contraseñas**: mínimo 8 (hecho), recomendación 12; comparar contra lista de contraseñas comunes; bcrypt coste 12.
5. **Reseteo**: invalidar `sessionVersion` al cambiar contraseña; códigos de un solo uso con TTL (hecho) y límite por email+IP.
6. **Rate limiting distribuido** (Redis) con contador por IP y por cuenta; bloqueo temporal tras N fallos.
7. **Registro**: por defecto **cerrado** en despliegues públicos (`DISABLE_SIGNUP=true`); alta del primer admin por CLI/`/setup` con token de instalación.

### 7.3 Autorización

Matriz actual (tras los cambios):

| Recurso | Anónimo | Usuario autenticado |
|---|---|---|
| Compose propio | — | RW |
| Compose ajeno | — | — (bloqueado por `userId`) |
| Share público | R | R |
| Crear share | — | Solo de proyectos propios |
| HA (status/failover/backup/restore/config) | — | Solo propios |
| Containers/volúmenes del host (deploy/settings) | — | **RW sobre todo el host** |
| Terminal (`exec`) | — | **Ejecución en cualquier contenedor** |
| Info del sistema | — | (antes anónimo) ahora autenticado |

Diseño objetivo:

1. **RBAC real**: `role` (`admin`/`operator`/`viewer`) evaluado en servidor. Las acciones de host exigen `admin`; las de proyecto exigen propiedad.
2. **Etiquetar despliegues**: al hacer `up`, inyectar `labels: com.expanse.owner=<userId>` y `com.expanse.compose=<id>`; `stopContainer`, `removeContainer`, `removeProjectByName`, `execDockerCommand` verifican la etiqueta antes de operar.
3. **Aislar el socket**: `docker-socket-proxy` con allowlist de endpoints (`containers`, `images`, `networks`, `volumes`) y denegar `exec`, `swarm`, `system`; o Daemon API por mTLS. El proceso web no debe ser root.
4. **Validar el compose antes de desplegar** contra el esquema de Compose y una allowlist de:
   - rutas de bind mounts (prohibir `/`, `/etc`, `/root`, `/var/run/docker.sock`, `..`);
   - `privileged: true`, `cap_add`, `pid: host`, `network_mode: host`, `devices`;
   - imágenes con `build:` locales fuera de un directorio permitido.
5. **Reautenticación** server-side para acciones destructivas de host y HA.

### 7.4 Secretos y datos

- Secretos solo por entorno; nunca en logs (corregido para GitHub/reset).
- Redacción centralizada en logger; prohibir `console.log` de objetos de configuración.
- **Rotar** `GITHUB_CLIENT_SECRET`/tokens si se conservaron logs antiguos.
- Credenciales de nodos remotos cifradas en reposo (hoy el stub no guarda nada).
- Compartir proyectos: enlaces con **token firmado y caducable**, opción de revocar y de proteger con contraseña (hoy el `shareId` es permanente y público).
- Exportaciones PNG: nombres por checksum (hecho) y retención; no servir archivos no generados por la app.

### 7.5 Aislamiento de Docker (SEC-13)

Opción A (mínima, recomendada para self-hosted):

1. `DISABLE_SIGNUP=true` por defecto en el compose.
2. Crear el primer admin durante la instalación.
3. Exigir HTTPS (`URL=https://…`) → cookies `Secure` + HSTS.
4. Restringir `saveRemoteNodeConfig` (stub) y documentar que la app equivale a root.

Opción B (multi-tenant real, esfuerzo alto):

1. Socket proxy + usuario sin root + RBAC + etiquetas de propiedad.
2. Un daemon Docker por tenant (Docker-in-Docker/rootless) o un orquestador por usuario.
3. Cuotas y límites de recursos por usuario.

### 7.6 Cadena de suministro

- `pnpm audit` en CI (hecho) + Dependabot/Renovate.
- Escaneo de imagen (Trivy/Grype) en CI y firma (cosign/SBOM).
- Eliminar el script `opentech-ux.org` o cargarlo solo con consentimiento explícito y `integrity` (SRI). Bloquearlo con CSP si se mantiene.
- Pinear imágenes por digest (`mongo:7.0@sha256:…`) y `pnpm` por versión exacta (hecho).

### 7.7 Cabeceras y navegador

Implementadas: `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `X-DNS-Prefetch-Control`, HSTS condicional.

Pendiente: **CSP con nonce** (`script-src 'self' 'nonce-…'`), `frame-ancestors`, `base-uri 'none'`, `form-action 'self'`. Requiere revisar los scripts inline de Next y la telemetría externa.

### 7.8 Registro y respuesta a incidentes

- Auditar: login (éxito/fallo), cambios de contraseña, borrados, deploys, failover/restore, cambios de configuración de host.
- Alertar: picos de 401/429, errores 5xx, tamaño anómalo de body, comandos `exec`.
- Procedimiento documentado: rotar `SECRET_KEY` (invalida todas las sesiones), rotar secretos OAuth/Brevo, revisar `audit_log`, reconstruir la imagen.

### 7.9 Criterios de aceptación (seguridad)

- [x] Ninguna Server Action devuelve datos de otro usuario.
- [x] Ninguna Server Action confía en flags del cliente para autenticar.
- [x] Cookie con `HttpOnly` + `SameSite` + `Secure` condicional.
- [x] APIs con validación de ObjectId y errores sin detalles internos.
- [x] `pnpm audit` sin hallazgos.
- [ ] Rate limiting compartido y bloqueo de cuenta.
- [ ] Sesiones revocables y MFA para admin.
- [ ] CSP y eliminación/opt-in de telemetría externa.
- [ ] RBAC + etiquetas de propiedad en acciones Docker.
- [ ] Socket proxy / rootless.

---

## 8. Cambios implementados en este ciclo

### Seguridad

| Archivo | Cambio |
|---|---|
| `lib/oauth.ts` (nuevo) | Login/registro OAuth fuera del módulo `'use server'` |
| `actions/userActions.ts` | `createOrLoginUser` solo con contraseña; validación zod; rate limit; cookie segura; IDOR de compose público cerrado; reset con 8 caracteres |
| `lib/session.ts` (nuevo) | Construcción de cookie y token centralizada |
| `lib/rateLimit.ts` (nuevo) | Limiter en memoria |
| `lib/validation.ts` (nuevo) | Esquemas reutilizables (email, ObjectId, registro) |
| `lib/dbIndexes.ts` (nuevo) | Índices y TTL idempotentes |
| `actions/composeActions.ts` | Propiedad al compartir; solo shares públicos; validación de IDs |
| `actions/databaseHA.ts` | Ownership en todas las operaciones; fix `doc.data` |
| `actions/systemActions.ts` | `ensureAuth` y sin log de configuración |
| `app/api/auth/external/*` | Sin log del token; usa `lib/oauth` |
| `app/api/export/png/route.ts` | BD correcta, validación, solo públicos, errores genéricos |
| `app/api/compose/route.ts` | Validación y manejo de errores |
| `app/api/logos/library/[name]/route.ts` | Allowlist + contención de ruta |
| `middleware.ts` | Locale soportado, `/deploy` protegido, sin bucle si falta `SECRET_KEY` |
| `next.config.mjs` | Cabeceras de seguridad, `poweredByHeader:false`, body limit 4 MB |
| `lib/brevo.ts`, reset page | Sin secretos en logs |

### Usabilidad y estabilidad

| Archivo | Cambio |
|---|---|
| `app/[locale]/page.tsx` | Corregido el `ReferenceError` (TDZ) del listado |
| `components/playground/playGroundContent.tsx` | Habilita guardado/autoguardado con sesión válida |
| `store/compose.ts` | Guardado con `id` capturado, cancelación al cambiar de proyecto |
| `app/[locale]/error.tsx`, `not-found.tsx` (nuevos) | Estados de error/404 |
| `app/[locale]/share/error.tsx`, `components/playground/asyncReadonlyPlayground.tsx` | Sin filtrar `error.message`; share inexistente con mensaje |
| `instrumentation.ts` | Bootstrap de índices |

### Pruebas añadidas

- `tests/actions/auth.test.ts` — regresión de account takeover (6 casos).
- `tests/lib/session.test.ts` — atributos de cookie.
- `tests/lib/rateLimit.test.ts` — ventana y límites.
- `tests/lib/validation.test.ts` — ObjectId y política de contraseñas.

---

## 9. Backlog priorizado

### P0 — antes de exponer la instancia a Internet

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 1 | `DISABLE_SIGNUP=true` por defecto + alta del primer admin por instalación | Sin registro público salvo opt-in explícito |
| 2 | RBAC real y etiquetas de propiedad en acciones Docker | Un usuario no puede operar contenedores ajenos (test) |
| 3 | Socket proxy/rootless o documentar formalmente el riesgo y exigir admin | El proceso web no es root; `exec` deshabilitado por defecto |
| 4 | Eliminar u opt-in la telemetría externa + SRI | Network log sin `opentech-ux.org` salvo consentimiento |
| 5 | Rotar secretos que pasaron por logs | `GITHUB_CLIENT_SECRET`/tokens rotados |
| 6 | HTTPS obligatorio en despliegues públicos | `URL` https, cookie `Secure`, HSTS |

### P1 — siguiente iteración

1. Sesiones revocables + expiración corta + logout global.
2. Rate limiting distribuido y bloqueo de cuenta.
3. CSP con nonce y `frame-ancestors`.
4. Control de versión en guardado (`409` + merge) y `sendBeacon`.
5. Timeouts/reintentos de Mongo y endpoint `/api/ready`.
6. Reautenticación server-side en operaciones destructivas.
7. i18n completo + accesibilidad (axe en CI).
8. Límites de recursos y retención de exports/temporales.
9. Logs estructurados con redacción + `audit_log`.
10. E2E (Playwright) de los flujos críticos.

### P2 — madurez

1. MFA para administradores.
2. Enlaces de compartición firmados, caducables y revocables.
3. Backups de Mongo con restauración probada + runbook.
4. Escaneo de imagen/SBOM/firma en CI.
5. Multi-tenant con cuotas (si el producto lo requiere).
6. Migración a una base de datos con transacciones para operaciones compuestas.

---

## 10. Plan de pruebas

### 10.1 Ejecutado

- Unitarias: nombres Docker, sanitización, referencias, esquemas, rate limit, cookies, OAuth bypass.
- Integración: 122 plantillas contra `docker compose config`; smoke real de Redis/PostgreSQL; YAML con red inválida.
- Seguridad dinámica: Server Actions sin sesión, IDOR, bypass de locale, IDs malformados, cabeceras de cookie.
- Build y arranque del contenedor, healthchecks y `/api/ping`.

### 10.2 Pendiente

| Tipo | Herramienta | Objetivo |
|---|---|---|
| E2E | Playwright | Registro→crear→guardar→recargar→desplegar→compartir |
| Accesibilidad | axe-core / Lighthouse | 0 violaciones críticas |
| Carga | k6 | Deploy concurrente, límites de body, rate limit |
| Caos | Toxiproxy/iptables | Mongo/Docker caídos y recuperación |
| Seguridad | ZAP baseline | XSS, CSRF, headers, open redirects |
| Dependencias | Trivy + audit | 0 CVEs altas en imagen y lockfile |

---

## 11. Riesgos aceptados y decisiones

1. **Autoguardado en `disabled=false`**: se activa al confirmar sesión en el playground; si la comprobación falla por red, el usuario ve el diálogo de registro (comportamiento conservador). Se puede reintentar.
2. **Rate limit en memoria**: suficiente para la instalación de referencia (un proceso). No protege múltiples réplicas; documentado como P1.
3. **Emails en minúsculas**: los nuevos registros se normalizan; los existentes conservan su forma. Antes de activar el índice único en bases antiguas, ejecutar una migración de normalización.
4. **`X-Frame-Options: SAMEORIGIN`** en lugar de `DENY` para permitir embeber el propio canvas si el producto lo necesita.
5. **No se eliminó la telemetría externa**: es una decisión de producto; se documenta como P0 para instancias expuestas.
6. **`execDockerCommand` sigue existiendo**: es una función del producto (terminal). Debe quedar detrás de rol admin y socket proxy.

---

## Anexo A — Cómo reproducir la verificación

```bash
# 1. Calidad y tests
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
pnpm audit --audit-level=low

# 2. Build y arranque
pnpm generate-secrets          # si no existe .env
docker compose build app
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:4000/api/ping

# 3. Cabeceras
curl -sI http://127.0.0.1:4000/en | grep -iE "x-frame|nosniff|referrer|permissions"

# 4. Rutas que antes fallaban
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/compose?id=nope        # 400
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/export/png?shareId=nope # 400
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/en/deploy/settings          # 307 → /en

# 5. Plantillas
pnpm test:docker
```

## Anexo B — Entorno de referencia

- Node 24.20, pnpm 12.3.4, Next 15.5.29, React 19.3.1.
- MongoDB 7.0 (contenedor), Docker Engine 29.1.3, Compose v5.4.0.
- Contenedor de app: `node:24-alpine`, usuario `root`, socket Docker montado.

---

*Documento vivo. Cualquier cambio en el modelo de amenazas (p. ej. abrir registro público, multi-tenant o exponer la API) debe actualizar §7 antes de desplegar.*
