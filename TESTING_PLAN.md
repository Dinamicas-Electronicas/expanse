# Testing Plan - Expanse HA Integration

## Overview
Comprehensive testing strategy for High Availability database integration in Expanse, covering unit, integration, E2E, and chaos testing.

---

## 1. Unit Tests

### 1.1 Location: `tests/ha/`

```
tests/ha/
├── validateHAConfig.test.ts          # HA config validation
├── generateHACompose.test.ts         # Docker Compose generation
├── patroniConfigGenerator.test.ts    # Patroni YAML generation
├── haproxyConfigGenerator.test.ts    # HAProxy config generation
├── pgbouncerConfigGenerator.test.ts  # PgBouncer config generation
├── backupCronGenerator.test.ts       # Backup script generation
├── replicationTopology.test.ts       # Topology helper functions
├── viewerServices.test.ts            # Web service viewer extraction
├── haStore.test.ts                   # Zustand store actions
└── haPollingHook.test.ts             # React polling hooks
```

### 1.2 Test Commands

```bash
# Run all HA unit tests
pnpm test tests/ha/

# Run specific test file
pnpm test tests/ha/validateHAConfig.test.ts

# Run with coverage
pnpm test --coverage tests/ha/

# Watch mode for development
pnpm test:watch tests/ha/
```

### 1.3 Key Test Cases

#### validateHAConfig.test.ts
```typescript
describe('validateHAConfig', () => {
  it('should pass valid async replication with 2 replicas', async () => {
    const config = createDefaultHAConfig();
    config.replication.mode = 'async';
    const result = await validateHAConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should fail sync mode without sync replicas', async () => {
    const config = createDefaultHAConfig();
    config.replication.mode = 'sync';
    config.replication.replicas = [{ region: 'r1', role: 'async', priority: 50 }];
    const result = await validateHAConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'NO_SYNC_REPLICA' }));
  });

  it('should warn on poolSize > maxConnections', async () => {
    const config = createDefaultHAConfig();
    config.connectionPool.poolSize = 2000;
    config.connectionPool.maxConnections = 1000;
    const result = await validateHAConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should enforce quorum minimum 3 voters', async () => {
    const config = createDefaultHAConfig();
    config.replication.replicas = [{ region: 'r1', role: 'witness', priority: 1 }];
    const result = await validateHAConfig(config);
    expect(result.valid).toBe(false);
  });
});
```

#### generateHACompose.test.ts
```typescript
describe('generateHACompose', () => {
  it('should generate compose with all HA services', () => {
    const baseCompose = createBaseCompose();
    const haConfig = createDefaultHAConfig();
    const result = generateHACompose({ baseCompose, haConfig, projectName: 'test', dbCredentials: {...} });
    
    expect(result.services).toHaveProperty('etcd');
    expect(result.services).toHaveProperty('db-primary');
    expect(result.services).toHaveProperty('db-replica');
    expect(result.services).toHaveProperty('pgbouncer');
    expect(result.services).toHaveProperty('haproxy');
    expect(result.services).toHaveProperty('backup');
  });

  it('should set correct replica count from config', () => {
    const haConfig = createDefaultHAConfig();
    haConfig.replication.replicas = [{...}, {...}, {...}]; // 3 replicas
    const result = generateHACompose({...});
    expect(result.services['db-replica'].deploy.replicas).toBe(3);
  });

  it('should create overlay network', () => {
    const result = generateHACompose({...});
    expect(result.networks['expanse-network'].driver).toBe('overlay');
  });
});
```

---

## 2. Integration Tests

### 2.1 Location: `tests/integration/`

```
tests/integration/
├── ha-deploy.test.ts           # Full HA deploy cycle
├── ha-failover.test.ts         # Failover scenarios
├── ha-backup-restore.test.ts   # Backup/restore cycle
├── ha-metrics.test.ts          # Pool metrics collection
└── multi-engine.test.ts        # MySQL, MongoDB, Redis HA
```

### 2.2 Prerequisites

```bash
# Start test infrastructure
docker compose -f docker-compose.test.yml up -d
# Requires: Docker daemon, 4GB+ RAM, 2 CPU cores

# Or use kind for Kubernetes-style testing
kind create cluster --name expanse-ha-test
```

### 2.3 Test Commands

```bash
# Run integration tests (requires Docker)
pnpm test tests/integration/

# Run specific integration test
pnpm test tests/integration/ha-deploy.test.ts

# Run with extended timeout (failover tests need time)
pnpm test --timeout=120000 tests/integration/ha-failover.test.ts
```

### 2.4 Key Test Scenarios

#### ha-deploy.test.ts
```typescript
describe('HA Deploy Integration', () => {
  let composeId: string;

  beforeAll(async () => {
    // Create compose via API
    composeId = await createTestCompose('postgresql-ha');
  });

  afterAll(async () => {
    await cleanupCompose(composeId);
  });

  it('should deploy PostgreSQL HA cluster successfully', async () => {
    const result = await runCompose(composeId);
    expect(result.success).toBe(true);

    // Wait for cluster to stabilize
    await waitForClusterHealthy(composeId, 120000);

    // Verify all services running
    const status = await getComposeStatus(composeId);
    expect(status.find(s => s.Service === 'db-primary')?.State).toBe('running');
    expect(status.filter(s => s.Service?.startsWith('db-replica')).every(s => s.State === 'running')).toBe(true);
    expect(status.find(s => s.Service === 'pgbouncer')?.State).toBe('running');
    expect(status.find(s => s.Service === 'haproxy')?.State).toBe('running');
  });

  it('should connect via HAProxy and route to primary', async () => {
    const conn = await connectToHAProxy(composeId);
    const isPrimary = await conn.query('SELECT pg_is_in_recovery()');
    expect(isPrimary).toBe(false); // false = primary
  });

  it('should route read queries to replicas via PgBouncer', async () => {
    const pool = await connectToPgBouncer(composeId);
    // Run multiple queries, verify distribution
    const results = await Promise.all(
      Array(10).fill(null).map(() => pool.query('SELECT pg_is_in_recovery()'))
    );
    const replicaCount = results.filter(r => r === true).length;
    expect(replicaCount).toBeGreaterThan(0); // Some reads go to replicas
  });
});
```

#### ha-failover.test.ts
```typescript
describe('HA Failover', () => {
  it('should failover within 30 seconds when primary killed', async () => {
    const startTime = Date.now();
    
    // Kill primary container
    await dockerKill('db-primary');
    
    // Wait for new primary
    await waitForNewPrimary(composeId, 30000);
    
    const failoverTime = Date.now() - startTime;
    expect(failoverTime).toBeLessThan(30000);
    
    // Verify cluster still accepts writes
    const conn = await connectToHAProxy(composeId);
    await conn.query('CREATE TABLE test_failover (id INT)');
    await conn.query('INSERT INTO test_failover VALUES (1)');
    const result = await conn.query('SELECT * FROM test_failover');
    expect(result.length).toBe(1);
  });

  it('should record failover event in metadata', async () => {
    await simulateFailover(composeId, 'db-replica-1');
    
    const status = await getHAStatus(composeId);
    expect(status.lastFailover).toBeDefined();
    expect(status.lastFailover?.success).toBe(true);
    expect(status.lastFailover?.fromNode).toBe('db-primary');
  });

  it('should handle split-brain scenario gracefully', async () => {
    // Partition network between primary and replicas
    await networkPartition(composeId, 'db-primary', ['db-replica-1', 'db-replica-2']);
    
    // Should not promote replica without quorum
    await waitForClusterStatus(composeId, 'critical', 10000);
    
    // Heal partition
    await networkHeal(composeId);
    
    // Should recover automatically
    await waitForClusterHealthy(composeId, 30000);
  });
});
```

---

## 3. E2E Tests (Playwright)

### 3.1 Location: `tests/e2e/`

```
tests/e2e/
├── ha-wizard.spec.ts           # HA configuration wizard
├── ha-dashboard.spec.ts        # Runtime dashboard
├── ha-failover-ui.spec.ts      # Manual failover from UI
├── backup-manager.spec.ts      # Backup create/restore UI
├── service-viewer.spec.ts      # Web service viewer
└── template-selector.spec.ts   # HA template selection
```

### 3.2 Setup

```bash
# Install Playwright
pnpm exec playwright install

# Run E2E tests
pnpm test:e2e

# Run headed (visible browser)
pnpm test:e2e --headed

# Run specific test
pnpm test:e2e tests/e2e/ha-wizard.spec.ts
```

### 3.3 Playwright Config (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  fullyParallel: true,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 3.4 Key E2E Scenarios

#### ha-wizard.spec.ts
```typescript
test('complete HA wizard flow', async ({ page }) => {
  await page.goto('/en/dashboard/playground');
  
  // Add PostgreSQL HA template
  await page.click('[data-testid="add-service"]');
  await page.fill('[data-testid="search"]', 'PostgreSQL HA');
  await page.click('[data-testid="template-postgresql-ha"]');
  
  // Open HA config panel
  await page.click('[data-testid="ha-config-button"]');
  
  // Configure replication
  await page.click('[data-testid="replication-tab"]');
  await page.selectOption('[data-testid="replication-mode"]', 'sync');
  await page.fill('[data-testid="primary-region"]', 'us-east-1');
  
  // Add replica
  await page.click('[data-testid="add-replica"]');
  await page.fill('[data-testid="replica-region-0"]', 'us-east-2');
  await page.selectOption('[data-testid="replica-role-0"]', 'sync');
  
  // Configure failover
  await page.click('[data-testid="failover-tab"]');
  await page.fill('[data-testid="failover-timeout"]', '30');
  
  // Configure pooling
  await page.click('[data-testid="pool-tab"]');
  await page.fill('[data-testid="pool-size"]', '50');
  
  // Save and deploy
  await page.click('[data-testid="save-ha-config"]');
  await page.click('[data-testid="deploy-button"]');
  await page.click('[data-testid="deploy-with-ha"]');
  
  // Wait for deploy
  await expect(page.locator('[data-testid="deploy-status"]')).toContainText('Ready', { timeout: 180000 });
  
  // Verify HA services in canvas
  await expect(page.locator('[data-testid="service-db-primary"]')).toBeVisible();
  await expect(page.locator('[data-testid="service-pgbouncer"]')).toBeVisible();
  await expect(page.locator('[data-testid="service-haproxy"]')).toBeVisible();
});
```

#### backup-manager.spec.ts
```typescript
test('create and restore backup', async ({ page }) => {
  await page.goto('/en/dashboard/playground?id=test-compose');
  
  // Open backup manager
  await page.click('[data-testid="backup-manager-tab"]');
  
  // Create backup
  await page.click('[data-testid="create-backup"]');
  await expect(page.locator('[data-testid="backup-status"]')).toContainText('Completed', { timeout: 60000 });
  
  // Verify backup in list
  await expect(page.locator('[data-testid="backup-list"]')).toContainText('expanse_');
  
  // Restore backup
  await page.click('[data-testid="restore-backup"]:first-child');
  await page.click('[data-testid="full-restore"]');
  await expect(page.locator('[data-testid="restore-success"]')).toBeVisible({ timeout: 60000 });
});
```

---

## 4. Chaos Testing

### 4.1 Tools

- **Chaos Mesh** (Kubernetes) or **LitmusChaos**
- **Docker network partitioning**: `docker network disconnect/connect`
- **Process killing**: `docker kill --signal=SIGKILL`

### 4.2 Scenarios

| Scenario | Tool | Expected Behavior |
|----------|------|-------------------|
| Primary DB crash | `docker kill db-primary` | Failover < 30s, no data loss (sync mode) |
| Network partition | `docker network disconnect` | No split-brain, quorum maintained |
| Replica lag spike | `tc qdisc add dev eth0 delay 5s` | Replica marked degraded, not promoted |
| PgBouncer OOM | `docker update --memory=50m pgbouncer` | Auto-restart, connections redistributed |
| HAProxy crash | `docker kill haproxy` | Auto-restart, health checks resume |
| etcd member loss | `docker kill etcd` | Cluster continues (quorum maintained) |
| Disk full | `fallocate -l 10G /data/fill` | Alerts triggered, graceful degradation |

### 4.3 Chaos Test Script

```bash
#!/bin/bash
# chaos-test.sh

COMPOSE_ID="test-chaos"
NAMESPACE="expanse-project_${COMPOSE_ID}"

echo "=== Starting Chaos Test Suite ==="

# 1. Primary kill test
echo "Test 1: Primary DB crash"
docker kill ${NAMESPACE}-db-primary-1
sleep 5
FAILOVER_TIME=$(measure_failover_time ${COMPOSE_ID})
echo "Failover time: ${FAILOVER_TIME}ms"
assert_lt ${FAILOVER_TIME} 30000

# 2. Network partition
echo "Test 2: Network partition"
docker network disconnect expanse-network ${NAMESPACE}-db-primary-1
sleep 10
assert_cluster_status ${COMPOSE_ID} "critical"
docker network connect expanse-network ${NAMESPACE}-db-primary-1
wait_for_healthy ${COMPOSE_ID} 60

# 3. Replica lag
echo "Test 3: Replica lag injection"
docker exec ${NAMESPACE}-db-replica-1 tc qdisc add dev eth0 root netem delay 5000ms
sleep 10
assert_replica_status ${COMPOSE_ID} "db-replica-1" "degraded"
docker exec ${NAMESPACE}-db-replica-1 tc qdisc del dev eth0 root

echo "=== Chaos Tests Complete ==="
```

---

## 5. Performance Testing

### 5.1 Load Test Script (`k6`)

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up
    { duration: '5m', target: 50 },   // Sustained load
    { duration: '2m', target: 100 },  // Peak
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function() {
  // Test via HAProxy
  const res = http.get('http://localhost:5432/health');
  check(res, { 'status 200': (r) => r.status === 200 });
  
  // Test via PgBouncer
  const pgRes = http.post('postgres://user:pass@localhost:6432/db', 
    'SELECT pg_sleep(0.01);');
  check(pgRes, { 'query ok': (r) => r.status === 200 });
  
  sleep(1);
}
```

```bash
k6 run load-test.js
```

### 5.2 Metrics to Capture

| Metric | Target |
|--------|--------|
| Failover time (sync) | < 10s |
| Failover time (async) | < 30s |
| Connection pool utilization | < 80% |
| Query latency (p95) | < 100ms |
| Replication lag (async) | < 1s |
| Backup duration (1GB) | < 5min |
| Restore duration (1GB) | < 10min |

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions (`.github/workflows/test-ha.yml`)

```yaml
name: HA Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test tests/ha/
      - run: pnpm lint

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      docker:
        image: docker:dind
        options: --privileged
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: docker compose -f docker-compose.test.yml up -d
      - run: sleep 30
      - run: pnpm test tests/integration/ --timeout=300000
      - run: docker compose -f docker-compose.test.yml down

  e2e-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm exec playwright install --with-deps
      - run: pnpm build
      - run: pnpm start &
      - run: sleep 30
      - run: pnpm test:e2e

  chaos-tests:
    runs-on: [self-hosted, linux, x64, docker]
    needs: integration-tests
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/chaos-test.sh
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: chaos-test-logs
          path: /tmp/chaos-logs/
```

---

## 7. Test Data & Fixtures

### 7.1 Fixtures Location: `tests/fixtures/ha/`

```
tests/fixtures/ha/
├── valid-ha-config.json
├── invalid-ha-configs/
│   ├── no-quorum.json
│   ├── sync-no-replicas.json
│   ├── pool-oversized.json
│   └── invalid-cron.json
├── sample-composes/
│   ├── postgresql-ha.yaml
│   ├── mysql-ha.yaml
│   ├── mongodb-ha.yaml
│   └── redis-ha.yaml
└── mock-responses/
    ├── ha-status-healthy.json
    ├── ha-status-degraded.json
    ├── pool-metrics.json
    └── backup-list.json
```

---

## 8. Debugging & Troubleshooting

### 8.1 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Patroni fails to start | etcd not ready | Add `depends_on: etcd: service_healthy` |
| HAProxy health checks fail | Wrong check path | Use TCP check for PostgreSQL, HTTP for apps |
| PgBouncer connection refused | Wrong DATABASE_URL | Ensure points to HAProxy, not direct DB |
| Failover timeout | Network latency | Increase `failover.timeout` |
| Backup fails | pg_dump permissions | Run backup container as postgres user |

### 8.2 Debug Commands

```bash
# Check Patroni status
docker exec expanse-project_<id>-db-primary-1 patronictl -c /etc/patroni/patroni.yml list

# Check HAProxy stats
curl http://localhost:8404/stats

# Check PgBouncer stats
docker exec expanse-project_<id>-pgbouncer-1 psql -U postgres -c "SHOW STATS;"

# Check replication lag
docker exec expanse-project_<id>-db-primary-1 psql -U postgres -c "SELECT * FROM pg_stat_replication;"

# View logs
docker compose -p expanse-project_<id> logs -f db-primary
```

---

## 9. Test Coverage Goals

| Component | Target Coverage |
|-----------|-----------------|
| `lib/metadata.ts` HA generators | 90% |
| `actions/databaseHA.ts` | 85% |
| `store/ha.ts` | 80% |
| `hooks/useHAPolling.ts` | 75% |
| `components/playground/panels/*` | 70% |
| `components/playground/nodes/*` | 70% |
| Overall HA code | 80% |

```bash
# Check coverage
pnpm test --coverage
# Open coverage report
open coverage/lcov-report/index.html
```

---

## 10. Pre-Release Checklist

- [ ] All unit tests pass
- [ ] Integration tests pass (3 consecutive runs)
- [ ] E2E tests pass on Chrome + Firefox
- [ ] Chaos tests pass (no data loss)
- [ ] Load test meets SLA targets
- [ ] Coverage > 80% for HA code
- [ ] No critical/security vulnerabilities
- [ ] Documentation updated
- [ ] CHANGELOG updated

---

## 11. Running Tests Locally

```bash
# Quick unit test run
pnpm test tests/ha/

# Full integration test (requires Docker)
docker compose -f docker-compose.test.yml up -d
pnpm test tests/integration/
docker compose -f docker-compose.test.yml down

# E2E tests
pnpm dev &
sleep 10
pnpm test:e2e

# With coverage
pnpm test --coverage tests/ha/
```

---

## 12. Test Maintenance

- **Weekly**: Run full test suite on main branch
- **Per PR**: Unit + changed integration tests
- **Monthly**: Chaos test suite
- **Per Release**: Full E2E + performance baseline