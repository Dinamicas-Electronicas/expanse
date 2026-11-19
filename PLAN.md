# Plan de Integración Técnica y Visual de Alta Disponibilidad en Bases de Datos

## Objetivo
Integrar capacidades de Alta Disponibilidad (HA) nativas para bases de datos en el editor visual de Expanse, permitiendo configurar replicación, failover automático, conexión pooling y balanceo de carga desde el canvas.

---

## 1. Arquitectura Técnica

### 1.1 Modelos de Datos (types/library.ts)

```typescript
// Extender TemplateService existente
interface DatabaseHAConfig {
  // Replicación
  replication: {
    enabled: boolean;
    mode: 'async' | 'sync' | 'semi-sync';
    primaryRegion: string;
    replicas: Array<{
      region: string;
      role: 'sync' | 'async' | 'witness';
      priority: number;
    }>;
  };

  // Failover
  failover: {
    enabled: boolean;
    timeout: number;           // segundos
    maxRetries: number;
    healthCheckInterval: number;
    promotionPolicy: 'priority' | 'latency' | 'manual';
  };

  // Connection Pooling (PgBouncer / ProxySQL)
  connectionPool: {
    enabled: boolean;
    type: 'pgbouncer' | 'proxysql' | 'haproxy';
    mode: 'transaction' | 'session' | 'statement';
    poolSize: number;
    maxConnections: number;
    idleTimeout: number;
  };

  // Load Balancer
  loadBalancer: {
    enabled: boolean;
    type: 'haproxy' | 'nginx' | 'envoy';
    algorithm: 'round-robin' | 'least-conn' | 'source-ip';
    healthCheckPath: string;
    stickySessions: boolean;
  };

  // Backup & Recovery
  backup: {
    enabled: boolean;
    schedule: string;          // cron
    retentionDays: number;
    storage: 'local' | 's3' | 'gcs' | 'azure';
    encryption: boolean;
    pointInTimeRecovery: boolean;
  };
}
```

### 1.2 Templates de Referencia (data/library/)

| Template | Motor | HA Features |
|----------|-------|-------------|
| `postgresql-ha.json` | PostgreSQL | Patroni + etcd, PgBouncer, HAProxy |
| `mysql-ha.json` | MySQL | InnoDB Cluster, ProxySQL, HAProxy |
| `mongodb-ha.json` | MongoDB | Replica Sets, Mongos sharding |
| `redis-ha.json` | Redis | Sentinel / Cluster mode |
| `mariadb-ha.json` | MariaDB | Galera Cluster, MaxScale |
| `cockroachdb-ha.json` | CockroachDB | Nativo (Raft) |

---

## 2. Integración en Canvas (components/playground/)

### 2.1 Nodos Visuales HA

```
┌─────────────────────────────────────────────────────┐
│  ┌─────────┐    ┌─────────┐    ┌─────────┐        │
│  │ Primary │◄───│ Replica │◄───│ Replica │        │
│  │  (RW)   │    │  (RO)   │    │  (RO)   │        │
│  └────┬────┘    └────┬────┘    └────┬────┘        │
│       │              │              │               │
│       └──────────────┼──────────────┘               │
│                      ▼                              │
│              ┌───────────────┐                      │
│              │  HAProxy/LB   │                      │
│              │  (Single IP)  │                      │
│              └───────┬───────┘                      │
│                      │                              │
│              ┌───────┴───────┐                      │
│              │  PgBouncer    │                      │
│              │  (Pooling)    │                      │
│              └───────────────┘                      │
└─────────────────────────────────────────────────────┘
```

### 2.2 Componentes UI Nuevos

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| `HANodeBadge` | `components/playground/nodes/` | Badge indicador HA en nodo (verde/amarillo/rojo) |
| `ReplicationTopology` | `components/playground/nodes/` | Visualizador de topología maestro-réplica |
| `HAConfigPanel` | `components/playground/panels/` | Panel lateral configuración HA |
| `FailoverTimeline` | `components/playground/panels/` | Timeline visual de failovers históricos |
| `PoolMetricsWidget` | `components/playground/panels/` | Métricas pool conexiones en tiempo real |
| `HATemplateSelector` | `components/library/` | Selector templates HA en biblioteca |

### 2.3 Estados Visuales

```typescript
type HAStatus = 
  | 'healthy'        // Verde: todo OK
  | 'degraded'       // Amarillo: réplica lagging / pool saturado
  | 'failover'       // Naranja: failover en progreso
  | 'critical'       // Rojo: primary down, sin quorum
  | 'maintenance';   // Gris: modo mantenimiento
```

---

## 3. Server Actions (actions/)

### 3.1 Nuevas Actions

```typescript
// actions/databaseHA.ts
export async function validateHAConfig(config: DatabaseHAConfig): Promise<ValidationResult>
export async function generateHACompose(haConfig: DatabaseHAConfig): Promise<string>
export async function simulateFailover(composeId: string, targetReplica?: string): Promise<FailoverResult>
export async function getHAStatus(composeId: string): Promise<HAStatusResponse>
export async function updatePoolConfig(composeId: string, poolConfig: PoolConfig): Promise<void>
export async function triggerBackup(composeId: string): Promise<BackupResult>
export async function listBackups(composeId: string): Promise<BackupInfo[]>
export async function restoreBackup(composeId: string, backupId: string): Promise<RestoreResult>
```

### 3.2 Validaciones Pre-Deploy

```typescript
function validateHACompose(config: DatabaseHAConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Quorum check
  if (config.replication.enabled) {
    const voters = config.replication.replicas.filter(r => r.role !== 'witness').length + 1;
    if (voters < 3) errors.push({ code: 'QUORUM', msg: 'Mínimo 3 nodos votantes para HA' });
  }
  
  // Port collisions
  const ports = [config.loadBalancer?.port, config.connectionPool?.port].filter(Boolean);
  if (new Set(ports).size !== ports.length) errors.push({ code: 'PORT_CONFLICT' });
  
  // Resource limits
  if (config.connectionPool.enabled && config.connectionPool.maxConnections > 1000) {
    errors.push({ code: 'POOL_OVERSIZED', msg: 'maxConnections > 1000 requiere tuning kernel' });
  }
  
  return errors;
}
```

---

## 4. Generación Docker Compose (lib/metadata.ts)

### 4.1 Estructura Generada

```yaml
# docker-compose.ha.yaml (generado automáticamente)
services:
  # Primary Database
  db-primary:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      PATRONI_SCOPE: expanse-cluster
      PATRONI_ETCD_HOSTS: etcd:2379
    volumes:
      - pg-primary-data:/var/lib/postgresql/data
      - ./patroni-primary.yml:/etc/patroni/patroni.yml
    deploy:
      placement:
        constraints: [node.role == manager]
    healthcheck:
      test: ["CMD-SHELL", "patronictl -c /etc/patroni/patroni.yml list"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Replicas (escalables)
  db-replica:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      PATRONI_SCOPE: expanse-cluster
      PATRONI_ETCD_HOSTS: etcd:2379
    volumes:
      - pg-replica-data:/var/lib/postgresql/data
    deploy:
      replicas: ${REPLICA_COUNT:-2}
      placement:
        preferences:
          - spread: node.labels.zone

  # Connection Pooling
  pgbouncer:
    image: edoburu/pgbouncer:latest
    environment:
      DATABASES: "postgres=host=haproxy port=5432 dbname=postgres"
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000
      DEFAULT_POOL_SIZE: 25
    ports:
      - "6432:6432"
    depends_on:
      haproxy:
        condition: service_healthy

  # Load Balancer
  haproxy:
    image: haproxy:2.8-alpine
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
    ports:
      - "5432:5432"
      - "8404:8404"  # Stats
    healthcheck:
      test: ["CMD", "haproxy", "-c", "-f", "/usr/local/etc/haproxy/haproxy.cfg"]
      interval: 10s

  # Coordination (etcd/Consul)
  etcd:
    image: bitnami/etcd:3.5
    environment:
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd:2379
    volumes:
      - etcd-data:/bitnami/etcd

volumes:
  pg-primary-data:
  pg-replica-data:
  etcd-data:
```

### 4.2 Funciones Generadoras

```typescript
// lib/metadata.ts - funciones existentes a extender
export function generatePatroniConfig(haConfig: DatabaseHAConfig): string
export function generateHaproxyConfig(haConfig: DatabaseHAConfig): string
export function generatePgbouncerConfig(haConfig: DatabaseHAConfig): string
export function generateEtcdConfig(haConfig: DatabaseHAConfig): string
export function generateBackupCronJob(haConfig: DatabaseHAConfig): string

// Nueva función principal
export function generateHACompose(
  baseCompose: ComposeObject,
  haConfig: DatabaseHAConfig
): ComposeObject
```

---

## 5. Store & Estado (store/)

### 5.1 Nuevo Store HA

```typescript
// store/ha.ts
interface HAState {
  // Config por compose
  configs: Record<string, DatabaseHAConfig>;
  
  // Estado runtime
  status: Record<string, HAStatusResponse>;
  
  // Métricas
  metrics: Record<string, {
    replicationLag: number;        // ms
    poolUtilization: number;       // %
    connectionsActive: number;
    connectionsIdle: number;
    failoverCount: number;
    lastFailover: Date | null;
  }>;
  
  // Actions
  setHAConfig: (composeId: string, config: DatabaseHAConfig) => void;
  updateHAStatus: (composeId: string, status: HAStatusResponse) => void;
  recordFailover: (composeId: string, event: FailoverEvent) => void;
  fetchMetrics: (composeId: string) => Promise<void>;
}
```

### 5.2 Integración con compose.ts

```typescript
// store/compose.ts - extensión
interface ComposeMetadata {
  // ... existing
  haConfig?: DatabaseHAConfig;
  haEnabled: boolean;
  haStatus?: HAStatus;
}
```

---

## 6. Flujo de Usuario (UX)

### 6.1 Wizard HA (Onboarding)

```
Paso 1: Seleccionar motor     → PostgreSQL / MySQL / MongoDB / Redis
Paso 2: Topología             → 1 Primary + 2 Replicas (mínimo)
Paso 3: Regiones/Zonas        → us-east-1a, us-east-1b, us-west-2a
Paso 4: Connection Pool       → PgBouncer (transacción) / ProxySQL
Paso 5: Load Balancer         → HAProxy (round-robin + health checks)
Paso 6: Backup                → S3 + Point-in-time recovery
Paso 7: Revisar & Deploy      → Validación puertos, recursos, quorum
```

### 6.2 Panel Runtime (Dashboard)

```
┌────────────────────────────────────────────────────────────┐
│  Database Cluster: prod-postgres          ● Healthy        │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Replication  │ │ Connection   │ │ Load Balancer      │  │
│  │  Primary     │ │ Pool         │ │ HAProxy            │  │
│  │  us-east-1a  │ │  78% used    │ │  5432 → 3 nodes    │  │
│  │  ████████    │ │  ████████░░  │ │  Algorithm: RR     │  │
│  │  Replica 1   │ │  25/32 conn  │ │  Health: ✓✓✓       │  │
│  │  us-east-1b  │ │  Lag: 12ms   │ │  Sticky: OFF       │  │
│  │  ████████    │ │              │ │                    │  │
│  │  Replica 2   │ │ [Configurar] │ │ [Configurar]       │  │
│  │  us-west-2a  │ │              │ │                    │  │
│  │  ██████░░    │ │              │ │                    │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
│                                                              │
│  [Failover Manual]  [Backup Now]  [Scale Replicas]  [Logs]  │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Visor de Servicios Web (Service Viewer)

Al desplegar un stack que contenga servicios con frontend web (WordPress, Pleroma, Ghost, Nextcloud, etc.), se genera automáticamente un **Visor** en la rejilla de servicios conectados:

```
┌─────────────────────────────────────────────────────────────┐
│  Stack: wordpress-full                    ● Deploy OK       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │  WordPress│  │   MariaDB │  │        VISOR             │  │
│  │  🌐 Web   │  │  🗄️ DB    │  │  ┌────────────────────┐  │  │
│  │  Port 80  │  │  Port 3306│  │  │  🌐 Abrir WordPress │  │  │
│  │  ● Running│  │  ● Running│  │  │  http://localhost:8080│  │  │
│  └──────────┘  └──────────┘  │  └────────────────────┘  │  │
│                               └──────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  [Abrir en nueva pestaña]  [Copiar URL]  [Ver logs]     │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 6.3.1 Modelo de Datos para Visor

```typescript
// types/library.ts - extensión en TemplateService
interface WebFrontendConfig {
  // Indica que este servicio expone una UI web
  hasWebUI: boolean;
  
  // Puerto interno del contenedor donde sirve la web
  internalPort: number;
  
  // Path base (ej: "/", "/admin", "/ghost/")
  basePath: string;
  
  // Health check endpoint para verificar que la web está lista
  healthCheckPath?: string;  // default: basePath
  
  // Tiempo estimado de arranque (segundos) para mostrar spinner
  startupTimeEstimate?: number;
  
  // Icono personalizado para el visor
  icon?: string;
  
  // Nombre amigable para el botón
  displayName?: string;
  
  // Si requiere HTTPS (para generar URLs correctas)
  requiresHttps?: boolean;
}

// Extender TemplateService
interface TemplateService {
  // ... campos existentes
  webFrontend?: WebFrontendConfig;
}
```

#### 6.3.2 Ejemplos de Configuración

```json
// wordpress.json
{
  "name": "WordPress",
  "image": "wordpress:latest",
  "category": "CMS",
  "webFrontend": {
    "hasWebUI": true,
    "internalPort": 80,
    "basePath": "/",
    "healthCheckPath": "/wp-login.php",
    "startupTimeEstimate": 30,
    "icon": "wordpress",
    "displayName": "WordPress Admin"
  }
}

// pleroma.json
{
  "name": "Pleroma",
  "image": "pleroma/pleroma:latest",
  "category": "Social",
  "webFrontend": {
    "hasWebUI": true,
    "internalPort": 4000,
    "basePath": "/",
    "healthCheckPath": "/api/v1/instance",
    "startupTimeEstimate": 60,
    "icon": "pleroma",
    "displayName": "Pleroma Frontend"
  }
}

// ghost.json
{
  "name": "Ghost",
  "image": "ghost:latest",
  "category": "CMS",
  "webFrontend": {
    "hasWebUI": true,
    "internalPort": 2368,
    "basePath": "/",
    "healthCheckPath": "/ghost/api/admin/site/",
    "startupTimeEstimate": 45,
    "icon": "ghost",
    "displayName": "Ghost Admin"
  }
}

// postgres.json (NO tiene webFrontend - es solo BD)
{
  "name": "PostgreSQL",
  "image": "postgres:16-alpine",
  "category": "Database"
  // sin webFrontend
}
```

#### 6.3.3 Componentes UI del Visor

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| `ServiceViewer` | `components/playground/viewer/` | Contenedor principal del visor en la rejilla |
| `ViewerCard` | `components/playground/viewer/` | Tarjeta individual por servicio web |
| `ViewerSpinner` | `components/playground/viewer/` | Spinner durante health check |
| `ViewerActions` | `components/playground/viewer/` | Botones: Abrir, Copiar URL, Ver logs |

#### 6.3.4 Lógica de Generación del Visor

```typescript
// lib/viewer.ts
export interface ViewerService {
  serviceId: string;
  serviceName: string;
  displayName: string;
  icon: string;
  url: string;                    // URL final (host:port/path)
  internalUrl: string;            // URL interna (servicio:puerto/path)
  healthCheckUrl: string;
  status: 'pending' | 'healthy' | 'unhealthy' | 'unknown';
  lastChecked: Date | null;
}

export function extractViewerServices(
  compose: Compose,
  deployedPorts: Record<string, number>  // serviceName -> hostPort
): ViewerService[] {
  const viewers: ViewerService[] = [];
  
  for (const service of compose.services) {
    const template = getTemplateByImage(service.image);
    if (!template?.webFrontend?.hasWebUI) continue;
    
    const hostPort = deployedPorts[service.name];
    if (!hostPort) continue;
    
    const config = template.webFrontend;
    const baseUrl = `http://localhost:${hostPort}`;
    const fullUrl = `${baseUrl}${config.basePath}`;
    const healthUrl = `${baseUrl}${config.healthCheckPath || config.basePath}`;
    
    viewers.push({
      serviceId: service.id,
      serviceName: service.name,
      displayName: config.displayName || service.name,
      icon: config.icon || 'globe',
      url: fullUrl,
      internalUrl: `http://${service.name}:${config.internalPort}${config.basePath}`,
      healthCheckUrl: healthUrl,
      status: 'pending',
      lastChecked: null
    });
  }
  
  return viewers;
}

// Health check polling
export async function pollViewerHealth(
  viewers: ViewerService[],
  onUpdate: (v: ViewerService) => void,
  intervalMs = 5000,
  maxAttempts = 20
): Promise<void>
```

#### 6.3.5 Integración en Deploy Flow

```typescript
// actions/dockerActions.ts - extensión en runCompose
export async function runCompose(
  composeId: string,
  yamlContent: string,
  haConfig?: HaDeploymentConfig
) {
  // ... existing deploy logic ...
  
  // DESPUÉS de deploy exitoso:
  if (result.success) {
    // 1. Obtener puertos asignados realmente
    const deployedPorts = await getDeployedPorts(composeId);
    
    // 2. Extraer servicios con webFrontend
    const viewers = extractViewerServices(parsedYaml, deployedPorts);
    
    // 3. Iniciar health check polling en background
    if (viewers.length > 0) {
      startViewerPolling(composeId, viewers);
    }
    
    // 4. Guardar viewers en DB para persistencia
    await saveViewersToCompose(composeId, viewers);
  }
  
  return result;
}
```

#### 6.3.6 Estados del Visor

```
┌────────────────────────────────────────────────────────────┐
│  VISOR: WordPress                                          │
├────────────────────────────────────────────────────────────┤
│  ⏳ Iniciando... (estimado 30s)                            │
│  ████████░░░░░░░░░░░░░░░░░░░░░░ 25%                        │
│  [Cancelar verificación]                                   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  VISOR: WordPress                                          │
├────────────────────────────────────────────────────────────┤
│  ✅ Servicio web disponible                                │
│  🌐 http://localhost:8080/                                 │
│  [Abrir en nueva pestaña]  [Copiar URL]  [Ver logs]       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  VISOR: WordPress                                          │
├────────────────────────────────────────────────────────────┤
│  ❌ No responde (después de 60s)                           │
│  🔍 http://localhost:8080/wp-login.php                     │
│  [Reintentar]  [Ver logs]  [Diagnosticar]                  │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Métricas y Observabilidad

### 7.1 Métricas Clave (Prometheus exporters)

| Métrica | Source | Alerta |
|---------|--------|--------|
| `pg_replication_lag_bytes` | PostgreSQL | > 100MB |
| `pgbouncer_pool_utilization` | PgBouncer | > 85% |
| `haproxy_backend_up` | HAProxy | == 0 |
| `etcd_server_has_leader` | etcd | == 0 |
| `patroni_cluster_members` | Patroni | < expected |

### 7.2 Panel Métricas HA (components/playground/haMetricsPanel.tsx)

- Gráfico replication lag (tiempo real)
- Conexiones activas vs pool size
- Historial failovers (timeline)
- Throughput read/write split

---

## 8. Testing Strategy

### 8.1 Unit Tests (tests/ha/)
- `validateHAConfig.test.ts` - validaciones quorum, puertos, recursos
- `generateHACompose.test.ts` - snapshots YAML generado
- `patroniConfigGenerator.test.ts` - config Patroni válida
- `haproxyConfigGenerator.test.ts` - health checks, timeouts

### 8.2 Integration Tests
- Deploy HA cluster en Docker Compose local
- Simular fallo primary → verificar failover < 30s
- Verificar connection pooling bajo carga
- Test backup/restore point-in-time

### 8.3 E2E Tests (Playwright)
- Wizard HA completo
- Panel runtime métricas
- Failover manual desde UI

---

## 9. Migración y Compatibilidad

### 9.1 Backwards Compatibility
- Templates existentes sin HA config → deploy normal (single instance)
- `haEnabled: false` por defecto
- Migración automática al editar compose existente

### 9.2 Feature Flags
```env
HA_FEATURES=true              # Habilita todo HA
HA_POSTGRES_PATRONI=true      # Motor específico
HA_MYSQL_INNODB_CLUSTER=true
HA_MONGODB_REPLICA_SET=true
```

---

## 10. Roadmap de Implementación

| Fase | Entregable | Estimación | Estado |
|------|------------|------------|--------|
| **1** | Types + Templates base (PostgreSQL HA) | 2 semanas | ✅ **COMPLETADO** |
| **2** | Generación Docker Compose HA (Patroni + HAProxy + PgBouncer) | 2 semanas | ✅ **COMPLETADO** |
| **3** | UI Canvas: Nodos HA, badges, panel config | 2 semanas | ✅ **COMPLETADO** |
| **4** | Server Actions: validate, deploy, failover, metrics | 1.5 semanas | ✅ **COMPLETADO** |
| **5** | Store HA + métricas runtime (WebSocket/Polling) | 1 semana | ✅ **COMPLETADO** |
| **6** | Templates MySQL, MongoDB, Redis HA | 2 semanas | ✅ **COMPLETADO** |
| **7** | Backup/Restore UI + Point-in-time recovery | 1.5 semanas | ✅ **COMPLETADO** |
| **8** | Testing E2E + Documentación + Release | 1 semana | ⏳ Pendiente |

**Total: ~13 semanas**

### 10.1 Detalle Fase 1 - COMPLETADA

- ✅ Extendido `types/library.ts`:
  - Nuevo `WebFrontendConfig` para visor de servicios web
  - Nuevo `DatabaseHAConfig` (comprehensive) con replication, failover, connectionPool, loadBalancer, backup
  - Mantenido `DatabaseHaConfig` (legacy) para compatibilidad hacia atrás
  - Añadidos tipos: `ReplicationConfig`, `FailoverConfig`, `ConnectionPoolConfig`, `LoadBalancerConfigExtended`, `BackupConfig`
  - Añadido `DatabaseHaType` extendido: `'patroni' | 'galera' | 'innodb-cluster' | 'replica-set' | 'sentinel' | 'raft'`
  - `TemplateService` actualizado con `databaseHA?`, `webFrontend?`

- ✅ Creado template `data/library/postgresql-ha.json`:
  - Stack completo: db-primary, db-replica (x2), etcd, pgbouncer, haproxy
  - Configuración HA completa en `databaseHA`
  - Patroni para gestión de cluster
  - etcd para coordinación
  - HAProxy como load balancer (puerto 5432 + stats 8404)
  - PgBouncer para connection pooling (puerto 6432)
  - Healthchecks en todos los servicios
  - Volúmenes persistentes para datos y etcd

### 10.2 Detalle Fase 2 - COMPLETADA

- ✅ Extendido `lib/metadata.ts` con nuevas funciones generadoras:

| Función | Descripción |
|---------|-------------|
| `generatePatroniConfig()` | Genera config YAML de Patroni para primary/replica con replicación sync/async, slots, pg_rewind |
| `generateEtcdConfig()` | Genera variables de entorno para etcd cluster |
| `generateHaproxyConfigTCP()` | HAProxy en modo TCP (capa 4) para PostgreSQL, con stats en puerto 8404 |
| `generatePgbouncerConfigExtended()` | Config completa PgBouncer con timeouts, pool sizing, DNS, logging |
| `generateBackupCronConfig()` | Script de backup pg_dump con cron, retención, encriptación GPG opcional, PITR |
| `generateHACompose()` | Función principal: toma compose base + HA config → genera compose HA completo |
| `generatePatroniConfigFiles()` | Genera ambos archivos patroni (primary.yml + replica.yml) |
| `generateAllHAConfigs()` | Genera todos los archivos de config: patroni-primary, patroni-replica, haproxy.cfg, pgbouncer.ini, backup.sh |

- ✅ Características del compose generado:
  - **etcd**: coordinación cluster (puerto 2379/2380)
  - **db-primary**: Patroni primary con placement en manager node
  - **db-replica**: Patroni replicas escalables (deploy.replicas), spread por zona
  - **pgbouncer**: Connection pooling modo transacción, 1000 max conn, 25 pool size
  - **haproxy**: Load balancer TCP round-robin, health checks, stats UI
  - **backup** (opcional): Sidecar pg_dump con cron, retención, encriptación
  - **Red**: overlay attachable `expanse-network`
  - **Volúmenes**: pg-primary-data, pg-replica-data, etcd-data, pg-backups
  - **Healthchecks**: En todos los servicios críticos

### 10.3 Detalle Fase 3 - COMPLETADA

- ✅ **Componentes Nodo HA** (`components/playground/nodes/`):
  - `HANodeBadge`: Badge de estado (healthy/degraded/failover/critical/maintenance/unknown) con tamaños sm/md/lg
  - `HAStatusIndicator`: Indicador circular solo icono
  - `HARoleBadge`: Badge de rol (primary/replica/witness/sync/async)
  - `ReplicationTopology`: Visualizador interactivo de topología maestro-réplica con:
    - Nodo primary destacado con réplicas en cascada
    - Líneas de conexión visuales
    - Modos de replicación (sync/async/semi-sync) con badges
    - Métricas de lag, prioridad, región, último heartbeat
    - Click handlers para configuración por nodo
    - Leyenda integrada
    - Helper `createTopologyFromHAConfig()` para crear desde config HA

- ✅ **Paneles de Configuración** (`components/playground/panels/`):
  - `HAConfigPanel`: Panel lateral con tabs (Replication, Failover, Pooling, Load Balancer, Backup)
    - Replication: enable/disable, mode (sync/async/semi-sync), primary region, lista réplicas editables (add/remove, region, role, priority)
    - Failover: timeout, max retries, health check interval, promotion policy (priority/latency/manual)
    - Pooling: PgBouncer/ProxySQL/HAProxy, mode (transaction/session/statement), pool size, max connections, idle timeout
    - Load Balancer: HAProxy/NGINX/Envoy, algorithm, ports, health check path, sticky sessions
    - Backup: cron schedule, retention, storage (local/S3/GCS/Azure), encryption, PITR
    - Validación en tiempo real con warnings (quorum, pool sizing, port conflicts)
  - `FailoverTimeline`: Timeline visual de eventos de failover con:
    - Iconos por tipo (automatic/manual/promotion/demotion/split-brain)
    - Estados success/failed con colores
    - Duración, nodos from/to, razón, detalles expandibles
    - Stats resumen (success rate, avg duration)
    - Helper `generateMockFailoverEvents()` para testing
  - `PoolMetricsWidget`: Métricas de connection pool en tiempo real:
    - Grid: Active, Idle, Waiting, Utilization con trend indicators
    - Barra de progreso de utilización con colores (verde/ámbar/rojo)
    - Config: max connections, pool size, min/reserve pool
    - Performance: avg query time, QPS, cache hit ratio
    - Server config: lifetime, idle timeout
    - Auto-refresh configurable
    - Helper `createMockPoolMetrics()` para testing

- ✅ **Selector de Templates HA** (`components/library/HATemplateSelector.tsx`):
  - Búsqueda por nombre/descripción/imagen
  - Filtro por categoría (Database, Cache, Queue, Applications)
  - Toggle "HA Only" para mostrar solo templates con haEnabled
  - Cards con badges de features HA (Full HA/Legacy HA, replication mode×count, Pool, LB, Backup)
  - Indicador visual de selección
  - Resumen de conteos por categoría

- ✅ **Visor de Servicios Web** (`components/playground/viewer/ServiceViewer.tsx`):
  - Grid de tarjetas por servicio con webFrontend
  - Estados: pending (spinner + progress bar), healthy (botón Open + Copy URL), unhealthy (Retry + diagnóstico)
  - Health check polling automático con intentos configurables
  - Estimación de tiempo de arranque con progreso
  - URLs externa e interna mostradas
  - Acciones: Open in new tab, Copy URL, View Logs
  - Footer: Open All Healthy, Retry Pending

### 10.4 Detalle Fase 4 - COMPLETADA

- ✅ **Server Actions HA** (`actions/databaseHA.ts`):
  - `validateHAConfig(config)`: Validación completa con errores y warnings:
    - Quorum check (mín 3 nodos votantes)
    - Modo sync requiere réplica sync
    - Pool sizing (poolSize ≤ maxConnections)
    - Timeouts y límites válidos
    - Cron format, retention days, storage backend
  - `generateHAComposeAction(composeId, haConfig, dbCredentials)`: Genera compose HA + config files desde DB
  - `getHAStatus(composeId)`: Estado runtime del cluster:
    - Cluster status (healthy/degraded/critical)
    - Primary + réplicas con lag, región, prioridad
    - Connection pool status (PgBouncer)
    - Load balancer status (HAProxy backends up/total)
    - Último failover registrado
  - `simulateFailover(composeId, targetReplica?)`: Failover manual vía patronictl:
    - Ejecuta `patronictl failover --force <target>`
    - Registra evento en metadata con timestamp, duración, éxito
  - `triggerBackup(composeId)`: Backup manual vía pg_dump:
    - Ejecuta script backup.sh en container backup
    - Registra backup en metadata con ID, filename, size, timestamp
  - `listBackups(composeId)`: Lista backups almacenados
  - `restoreBackup(composeId, backupId)`: Restore vía psql desde archivo backup
  - `getPoolMetrics(composeId)`: Métricas PgBouncer (SHOW STATS)
  - `updatePoolConfig(composeId, poolConfig)`: Actualiza config pool (requiere restart)

- ✅ **Integración en dockerActions.ts**:
  - `runCompose()`: Detecta HA en DB → usa `generateHACompose()` + `generateAllHAConfigs()`:
    - Escribe patroni-primary.yml, patroni-replica.yml, haproxy.cfg, pgbouncer.ini, backup.sh
    - Fallback a legacy HA injection (haDeploymentDialog) si no hay HA en DB
  - `restartCompose()`: Igual lógica HA para reinicios
  - Mantiene compatibilidad hacia atrás con `HaDeploymentConfig` simple

- ✅ **Tipos exportados**:
  - `ValidationResult`, `ValidationError`
  - `HAStatusResponse` con cluster status, primary, replicas, pool, LB
  - `FailoverResult`, `BackupResult`, `BackupInfo`, `RestoreResult`

### 10.5 Detalle Fase 5 - COMPLETADA

- ✅ **Store HA Zustand** (`store/ha.ts`):
  - Estado centralizado por composeId: configs, status, poolMetrics, failoverEvents, backups
  - Polling state tracking con intervalos por compose
  - Acciones CRUD completas para todos los tipos de datos HA
  - Helpers: `hasHAEnabled()`, `getClusterHealth()`, `createDefaultHAConfig()`, `mergeHAConfig()`
  - Selector hooks: `useHAConfig()`, `useHAStatus()`, `usePoolMetrics()`, `useFailoverEvents()`, `useBackups()`, `useClusterHealth()`, `useIsHAPolling()`

- ✅ **Integración en compose store** (`store/compose.ts`):
  - Campos `haConfig` y `haEnabled` en estado del compose
  - `setHAConfig()`: Sincroniza con HA store global
  - `setHAEnabled()`: Toggle HA
  - `replaceCompose()`: Limpia HA config al cambiar compose
  - `resetCompose()`: Limpia HA store y detiene polling

- ✅ **Hooks de Polling React** (`hooks/useHAPolling.ts`):
  - `useHAPolling()`: Hook principal con polling configurable (status/metrics/backups)
    - Intervalos independientes: status (10s), metrics (10s), backups (30s)
    - Auto-fetch inicial + intervals
    - Cleanup automático en unmount
    - Callbacks: onStatusChange, onMetricsChange, onError
    - Refresh manual con `refresh()`
  - Selector hooks: `useHAStatus()`, `usePoolMetrics()`, `useFailoverEvents()`, `useBackups()`, `useClusterHealth()`
  - `useClusterHealth()`: Retorna config visual para badge (healthy/degraded/critical/unknown)
  - `useHASync.ts`: `useHASync()` para sincronizar estado desde server, `useHAInit()` para inicializar desde compose doc

- ✅ **Características de polling**:
  - Polling basado en setInterval (no WebSocket - más simple, compatible con serverless)
  - Intervalos por tipo de dato (status/metrics más frecuentes, backups menos)
  - Manejo de errores con callbacks
  - No memory leaks: cleanup en useEffect return
  - Compatible con Server Components (server actions para fetch)

- ✅ **Tipos de datos en store**:
  - `HAStatusResponse`: cluster status, primary, replicas, pool, LB, lastFailover
  - `PoolMetrics`: connections, utilization, performance, server config
  - `FailoverEvent`: tipo, nodos, razón, duración, éxito
  - `BackupInfo`: ID, filename, size, timestamp, tipo, status

### 10.6 Detalle Fase 6 - COMPLETADA

- ✅ **Templates HA para motores adicionales** (`data/library/`):

| Template | Motor | Replicación | Failover | Pooling | Load Balancer | Características |
|----------|-------|-------------|----------|---------|---------------|-----------------|
| `mysql-ha.json` | MySQL 8.0 | InnoDB Cluster (Group Replication) | Automático (priority) | ProxySQL | MySQL Router (6446/6447) | 3 nodos (1 primary + 2 replicas), GTID, SSL ready |
| `mongodb-ha.json` | MongoDB 7.0 | Replica Set (3+1 arbiter) | Automático (priority) | N/A (drivers) | Mongos opcional | Keyfile auth, init script, 4 nodos |
| `redis-ha.json` | Redis 7.2 | Async replication + Sentinel | Automático (quorum 2) | N/A | HAProxy TCP | 3 Sentinels, master auth, RDB/AOF backup |

- ✅ **MySQL HA (`mysql-ha.json`)**:
  - Stack: mysql-primary, mysql-replica (x2), mysql-router, proxysql
  - InnoDB Cluster con Group Replication (modo sync)
  - MySQL Router para read/write splitting (puertos 6446 RW, 6447 RO)
  - ProxySQL para connection pooling (puerto 6033)
  - Config archivos: mysql-primary.cnf, mysql-replica.cnf, router.conf, proxysql.cnf
  - Healthchecks en todos los servicios
  - Volúmenes: mysql-primary-data, mysql-replica-data

- ✅ **MongoDB HA (`mongodb-ha.json`)**:
  - Stack: mongo-primary, mongo-replica (x2), mongo-arbiter, mongo-init
  - Replica Set con 3 data nodes + 1 arbiter (quorum)
  - Keyfile authentication entre nodos
  - Script init-replica.js para inicialización automática del replica set
  - Arbiter ligero (sin journal, oplog pequeño) solo para quorum
  - Healthchecks con mongosh ping
  - Volúmenes: mongo-primary-data, mongo-replica-data, configdb

- ✅ **Redis HA (`redis-ha.json`)**:
  - Stack: redis-primary, redis-replica (x2), redis-sentinel (x3), haproxy
  - Replicación async con Sentinel para failover automático
  - 3 Sentinels (quorum 2) para alta disponibilidad del propio Sentinel
  - HAProxy TCP load balancer (puerto 6379) con stats (8404)
  - Config: redis-primary.conf, redis-replica.conf, sentinel.conf, haproxy-redis.cfg
  - Backup RDB cada 6 horas (más frecuente que DBs relacionales)
  - Volúmenes: redis-primary-data, redis-replica-data

- ✅ **Características comunes**:
  - `haEnabled: true` en todos
  - `databaseHA` completo con replication, failover, connectionPool, loadBalancer, backup
  - `related_services` con healthchecks y dependencias correctas
  - Variables de entorno parametrizadas (passwords, cluster names)
  - Healthchecks específicos por motor (mysqladmin, mongosh, redis-cli)
  - Puertos expuestos diferenciados (DB, admin, router, sentinel)
  - JSON válido verificado

### 10.7 Detalle Fase 7 - COMPLETADA

- ✅ **Backup Manager UI** (`components/playground/panels/BackupManager.tsx`):
  - Lista de backups con search, filter por status (completed/failed/in_progress)
  - Botón "Create Backup" llama a `triggerBackup` server action
  - Estados visuales: creating, restoring, deleting con spinners
  - Columnas: filename, tipo (full/incremental), tamaño, fecha, status badge
  - Acciones por backup: Restore (full / point-in-time), Delete
  - Mensajes error/éxito con dismiss
  - Solo visible si `haEnabled && backup.enabled`

- ✅ **Point-in-Time Restore** (`components/playground/panels/PointInTimeRestore.tsx`):
  - Dialog modal con selector datetime-local
  - Rango válido: minTimestamp (WAL start) → maxTimestamp (backup completion)
  - Quick-select buttons: Latest, 5min, 15min, 1h ago
  - Timeline visual con marcador de posición seleccionada
  - Validación en tiempo real de timestamp dentro de rango
  - Advertencias: requiere WAL archiving, reemplaza BD completa
  - Botón restore llama a `restoreBackup` con timestamp

- ✅ **Integración en panels index**:
  - Exportados `BackupManager` y `PointInTimeRestore`
  - Disponibles para uso en dashboard/runtime

- ✅ **Server Actions Backup** (ya en Fase 4):
  - `triggerBackup()`: pg_dump manual, registra en metadata
  - `listBackups()`: Lista backups con metadata
  - `restoreBackup()`: psql restore desde archivo
  - PITR requiere `backup.pointInTimeRecovery: true` en config

### 10.8 Plan de Testing - CREADO

- ✅ **Documento completo**: `TESTING_PLAN.md` con:
  - **Unit Tests** (`tests/ha/`): validateHAConfig, generateHACompose, generators, store, hooks
  - **Integration Tests** (`tests/integration/`): deploy cycle, failover <30s, backup/restore, metrics
  - **E2E Tests** (`tests/e2e/` Playwright): HA wizard, dashboard, failover UI, backup manager, service viewer
  - **Chaos Testing**: Primary kill, network partition, replica lag, OOM, disk full
  - **Performance Testing**: k6 load test script, SLA targets
  - **CI/CD Pipeline**: GitHub Actions workflow con stages unit→integration→e2e→chaos
  - **Fixtures**: Valid/invalid configs, sample composes, mock responses
  - **Coverage Goals**: 80% overall, 90% generators, 85% actions
  - **Debug Commands**: Patroni, HAProxy, PgBouncer, replication lag
| Complejidad Patroni/etcd | Alta | Alto | Empezar con template PostgreSQL solo; abstraer en lib |
| Recursos CI/CD limitados | Media | Medio | Usar kind/k3d para tests HA en CI |
| Compatibilidad Docker Swarm vs K8s | Media | Alto | Generar compose standalone; documentar limitaciones |
| UX abrumadora | Alta | Medio | Progressive disclosure: simple → advanced |

---

## 12. Referencias Técnicas

- [Patroni Docs](https://patroni.readthedocs.io/)
- [PgBouncer Config](https://www.pgbouncer.org/config.html)
- [HAProxy Config](https://www.haproxy.com/documentation/hapee/latest/configuration/)
- [etcd Cluster](https://etcd.io/docs/v3.5/op-guide/clustering/)
- [MySQL InnoDB Cluster](https://dev.mysql.com/doc/mysql-shell/8.0/en/mysql-innodb-cluster.html)
- [MongoDB Replica Sets](https://www.mongodb.com/docs/manual/replication/)
- [Redis Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)