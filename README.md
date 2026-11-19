<div align="center">

  <img src="assets/expanse.png" alt="Expanse" width="150" />

  <h1>Expanse</h1>

  <p><strong>El IDE visual profesional para Docker Compose</strong></p>

  <p>Diseña tu infraestructura en un canvas, despliega con un clic y monitorea en tiempo real.<br/>
  Sin escribir una línea de YAML.</p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-blue.svg" alt="Licencia: MIT" /></a>
    <a href="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/ci.yml"><img src="https://github.com/Dinamicas-Electronicas/expanse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" alt="Next.js 15" />
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
- [Características principales](#-características-principales)
- [Capturas](#-capturas)
- [Primeros pasos](#-primeros-pasos)
- [Flujo de trabajo](#-flujo-de-trabajo)
- [Arquitectura técnica](#-arquitectura-técnica)
- [Comparativa](#-comparativa)
- [Desarrollo local](#-desarrollo-local)
- [Seguridad](#-seguridad)
- [Contribuir](#-contribuir)
- [Autoría y licencia](#-autoría-y-licencia)
- [Roadmap](#-roadmap)

---

## 🎯 ¿Qué es Expanse?

**Expanse** es una plataforma profesional que simplifica radicalmente el despliegue de
aplicaciones containerizadas. Diseña tu infraestructura visualmente, despliégala con un clic
y monitorea todo en tiempo real — sin escribir una sola línea de YAML.

> _"Docker Compose es potente, pero su YAML es frágil y propenso a errores. Expanse lo hace trivial."_

### 🎯 Público objetivo

| Segmento | Beneficio principal |
|----------|---------------------|
| **DevOps Engineers** | Prototipado rápido de arquitecturas, reducción de errores en YAML |
| **Startups** | Deploy de stacks completos (DB + Backend + Frontend) en minutos |
| **Desarrolladores individuales** | Curva de aprendizaje cero para Docker |
| **Equipos de producto** | Compartir configuraciones entre entornos |
| **Agencias** | Gestión multi-cliente sin complejidad |

---

## ✨ Características principales

### 🖼️ Editor visual de drag & drop

Interfaz intuitiva tipo canvas donde puedes:

- **Arrastrar servicios** desde una biblioteca de 140+ plantillas
- **Conectar visualmente** bases de datos, APIs, redes y volúmenes
- **Ver dependencias** entre servicios representadas como flechas
- **Auto-layout** inteligente que organiza nodos por tipología (routers → apps → databases)
- **Importar y exportar** `docker-compose.yml` sin perder la disposición del canvas

### 📦 Biblioteca de servicios enterprise

Plantillas verificadas y mantenidas para las tecnologías más populares:

| Categoría | Servicios |
|-----------|-----------|
| **Databases** | PostgreSQL, MySQL, MongoDB, Redis, MariaDB, Elasticsearch |
| **AI/ML** | Ollama, Open WebUI, Qdrant, AnythingLLM, vLLM, ComfyUI |
| **Automation** | n8n, Node-RED, Home Assistant, ActivePieces |
| **CMS** | WordPress, Ghost, Strapi, Directus, Drupal |
| **Monitoring** | Prometheus, Grafana, Zabbix, Netdata, Uptime Kuma |
| **Networking** | Nginx, Traefik, HAProxy, WireGuard, NetBird |
| **Messaging** | Rocket.Chat, Zulip, Matrix, Mattermost |
| **Media** | Jellyfin, Plex, Pi-hole, AdGuard |
| **Cloud** | Nextcloud, OwnCloud, Seafile, Duplicacy |

### 🚀 Despliegue inteligente

Un solo clic para desplegar stacks complejos. Expanse genera automáticamente:

- ✓ Healthchecks optimizados por tipo de servicio
- ✓ Variables de entorno inyectadas según dependencias
- ✓ Límites de CPU/memoria configurables
- ✓ Redes y volúmenes auto-configurados
- ✓ Resolución de conflictos de puertos con reasignación automática

### 🔄 Alta disponibilidad integrada

Configura HA en segundos sin ser experto en infraestructura:

| Componente | Tecnología | Beneficio |
|------------|------------|-----------|
| **Load Balancer** | HAProxy | Balanceo round-robin, health checks |
| **Autoscaling** | Docker Compose replicas | 2–10 réplicas automáticas |
| **Connection Pool** | PgBouncer | Transaction mode, hasta 100 conexiones |

### 📊 Monitoreo en tiempo real

- **Estado de servicios**: running, exited, unknown con iconografía clara
- **Métricas live**: CPU, memoria y disco por contenedor
- **Logs streaming**: transmisión en vivo con colores diferenciados
- **Terminal integrada**: xterm.js para acceso shell directo por contenedor

### 🔐 Seguridad y colaboración

- **Auth JWT** con cookies HTTP-only (expiración de 30 días)
- **Sharing granular**: comparte configuraciones vía link de solo lectura
- **Backup automático**: exporta e importa configuraciones
- **Validación de puertos**: detección proactiva de conflictos

---

## 📸 Capturas

<div align="center">
  <img src="assets/demo1.png" alt="Canvas de Expanse con un stack WordPress + MariaDB desplegado" width="100%" />
  <p><em>Canvas visual con servicios desplegados, logs en vivo y terminal integrada.</em></p>
</div>

---

## 🚀 Primeros pasos

### Requisitos previos

- Docker Engine 20.10+ y Docker Compose v2 (con el plugin `buildx`)
- pnpm 12 (solo para desarrollo local y para `pnpm generate-secrets`)
- MongoDB 5.0+ (incluido en el stack de `docker-compose.yml`)
- 4 GB de RAM mínimo recomendado
- Puerto `4000` disponible

### Instalación instantánea

```bash
# 1. Clona el repositorio
git clone https://github.com/Dinamicas-Electronicas/expanse.git
cd expanse

# 2. Genera .env con SECRET_KEY, DB_USER y DB_PASS aleatorios
pnpm generate-secrets

# 3. Construye y arranca el stack
docker compose up -d --build

# 4. Abre http://localhost:4000
```

> `SECRET_KEY`, `DB_USER` y `DB_PASS` son obligatorios: `docker compose` falla de forma
> explícita si faltan, en lugar de arrancar con credenciales por defecto.

### Reconstrucción limpia y autotest

```bash
# 1. Parar el stack (conserva los volúmenes de datos)
docker compose down --remove-orphans

# 2. Borrar la imagen y los artefactos de build (no toca otros proyectos)
docker image rm expanse:local
docker image prune -f        # solo imágenes colgantes (<none>)
docker builder prune -af     # caché de construcción

# 3. Reconstruir desde cero y arrancar
docker compose build --no-cache app
docker compose up -d

# 4. Verificación automática (contenedores, rutas, APIs y cabeceras)
pnpm smoke
```

> Los volúmenes `expanse_expanse_db_data` y `expanse_expanse_exports` **no** se borran con
> estos comandos. Para empezar de cero también en datos: `docker compose down -v`
> (¡elimina usuarios y proyectos!).

### Docker Run directo

Requiere un MongoDB accesible:

```bash
docker run -d \
  --name expanse \
  -p 4000:3000 \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e MONGODB_URI="mongodb://usuario:password@host:27017/expanse?authSource=admin" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  <usuario-dockerhub>/expanse:latest
```

> La imagen multi-arquitectura (`linux/amd64` + `linux/arm64`) se publica automáticamente en
> Docker Hub desde `main` con las credenciales `DOCKER_USERNAME` / `DOCKER_PASSWORD` del
> repositorio.

---

## 📖 Flujo de trabajo

### Fase 1 — Diseña

1. **Abre el canvas** → clic en «+» o selecciona servicios de la biblioteca
2. **Arrastra servicios** → PostgreSQL, Redis, tu API, Nginx
3. **Conecta servicios** → arrastra de un nodo a otro
4. **Configura** → clic en cualquier nodo para editar recursos

### Fase 2 — Despliega

1. **Clic en «Run»** → se abre el diálogo de HA (opcional)
2. **Selecciona opciones HA** → réplicas, load balancer, connection pool
3. **Confirma** → Expanse valida puertos y despliega
4. **Verifica** → estado «running» en verde

### Fase 3 — Monitorea

1. **Panel de ejecución** → estado de todos los servicios
2. **Logs live** → clic en un servicio para ver sus logs
3. **Terminal** → clic en el icono de terminal para un shell interactivo
4. **Métricas HA** → panel dedicado con throughput y conexiones

---

## 🏗️ Arquitectura técnica

### Stack tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| **Framework** | Next.js | 15.x |
| **UI** | React | 19.x |
| **Canvas** | @xyflow/react + ELK.js | 12.x / 0.9.x |
| **State** | Zustand | 5.x |
| **Database** | MongoDB + Mongoose | 6.x / 8.x |
| **Auth** | JWT (jose) + bcrypt | HS256 |
| **Styling** | Tailwind CSS + Radix UI | 3.x |
| **Terminal** | xterm.js | 5.x |
| **Validation** | Zod + react-hook-form | 3.x |

### Diagrama de arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Usuario                              │
│                    Browser (Chrome)                         │
│              https://localhost:4000                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                    Expanse Container                        │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │   Next.js      │  │    MongoDB     │  │     ELK       │  │
│  │  (App + API)   │  │   (Estado)     │  │  (Layout)     │  │
│  └───────┬────────┘  └────────────────┘  └───────────────┘  │
│          │                                                  │
│          │ docker.sock                                      │
│          ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Docker Engine                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │Postgres │  │  Redis  │  │ HAProxy │  │ Tu App  │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Modelo de datos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│   Compose   │────▶│  Metadata   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ _id         │     │ _id         │     │ Ids         │
│ email       │     │ userId      │     │ positionMap │
│ password    │     │ data        │     │ connection  │
│ companyType │     │ metadata    │     │ resources   │
└─────────────┘     │ createdAt   │     └─────────────┘
                    │ updatedAt   │
                    └─────────────┘
                           │
                    ┌──────▼──────┐
                    │   Share     │
                    ├─────────────┤
                    │ composeId   │
                    │ name        │
                    │ readOnly    │
                    └─────────────┘
```

---

## 🔄 Comparativa

| Feature | Docker Compose manual | Expanse |
|---------|-----------------------|---------|
| **Curva de aprendizaje** | Alta (YAML, networking, volumes) | Baja (visual drag & drop) |
| **Tiempo de prototipado** | 30–60 min por stack | 5 min por stack |
| **Errores de sintaxis** | Frecuentes (YAML es frágil) | Cero (generación automática) |
| **Setup HA** | Manual (HAProxy, réplicas) | 1 clic |
| **Monitoreo** | CLI `docker ps`, `logs` | Dashboard visual + terminal |
| **Sharing** | Archivos `.yml` por email | Links compartibles |
| **Validación de puertos** | Manual | Automática con reasignación |

---

## 🌐 Internacionalización

- **English (en)** — predeterminado
- **Español (es)** — completo

Los textos viven en `messages/en.json` y `messages/es.json` y se usan con `next-intl`.

---

## 🧑‍💻 Desarrollo local

```bash
pnpm install          # instala dependencias
pnpm sync-icons       # sincroniza iconos de la biblioteca (necesario antes de build)
pnpm dev              # servidor de desarrollo en http://localhost:3000
pnpm test             # tests unitarios (Vitest)
pnpm test:docker      # valida todas las plantillas con `docker compose config`
pnpm lint             # ESLint 9
pnpm audit            # auditoría de dependencias (falla con avisos altos/críticos)
pnpm license:check    # verifica que todos los archivos tengan el aviso de autoría
```

Variables de entorno relevantes: `SECRET_KEY`, `MONGODB_URI`, `URL`, `CORE_ONLY`,
`DISABLE_TELEMETRY`. Consulta `.env.example` y `docs/SDD.md`.

---

## 🛡️ Seguridad

Expanse monta el socket de Docker, por lo que **cualquier cuenta autenticada debe
considerarse con privilegios de administrador del host**. Antes de exponer la instancia a
Internet:

- Usa HTTPS y una `SECRET_KEY` robusta
- Restringe el registro (`DISABLE_SIGNUP=true`) o el acceso a la red
- Revisa el modelo de amenazas y el informe de auditoría en [`docs/SDD.md`](docs/SDD.md)

Si encuentras una vulnerabilidad, escríbenos a
[dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com) antes de abrir un
issue público.

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Lee [CONTRIBUTING.md](CONTRIBUTING.md) para conocer los
estándares de código, el flujo de pull requests y la convención de avisos de autoría.

---

## 📄 Autoría y licencia

**Expanse** es un proyecto de **Dinámicas Electrónicas**.

| | |
|---|---|
| **Autor** | Dinámicas Electrónicas |
| **Email** | [dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com) |
| **GitHub** | [@Dinamicas-Electronicas](https://github.com/Dinamicas-Electronicas) |
| **Licencia** | MIT © 2026 Dinámicas Electrónicas |

Todos los archivos fuente incluyen el aviso de autoría correspondiente:

```text
Expanse — IDE visual de Docker Compose
Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
Licencia MIT — consulta el archivo LICENSE en la raíz del proyecto.
```

El código se distribuye bajo la [licencia MIT](LICENSE): puedes usarlo, modificarlo y
redistribuirlo conservando el aviso de copyright.

---

## 🔮 Roadmap

- [ ] **v2.0**: Multi-cluster management (Kubernetes)
- [ ] **v2.1**: Templates marketplace con ratings
- [ ] **v2.2**: GitOps integration (GitHub Actions)
- [ ] **v2.3**: Team workspaces con RBAC
- [ ] **v2.4**: Cloud deployment target (AWS, GCP, Azure)

---

<div align="center">
  <sub>Hecho con ❤️ por <strong>Dinámicas Electrónicas</strong> para hacer Docker Compose accesible para todos.</sub>
  <br/>
  <sub>⭐ Si te gusta Expanse, danos una estrella en el repo.</sub>
</div>
