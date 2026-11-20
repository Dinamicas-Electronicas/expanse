/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  generateAllHAConfigs,
  generateHACompose,
} from '@/lib/metadata';
import type { DatabaseHAConfig } from '@/types/library';

const config: DatabaseHAConfig = {
  replication: {
    enabled: true,
    mode: 'sync',
    primaryRegion: 'test-a',
    replicas: [
      { region: 'test-b', role: 'sync', priority: 100 },
      { region: 'test-c', role: 'async', priority: 50 },
    ],
  },
  failover: {
    enabled: true,
    timeout: 30,
    maxRetries: 3,
    healthCheckInterval: 10,
    promotionPolicy: 'priority',
  },
  connectionPool: {
    enabled: true,
    type: 'pgbouncer',
    mode: 'transaction',
    poolSize: 25,
    maxConnections: 100,
    idleTimeout: 600,
  },
  loadBalancer: {
    enabled: true,
    type: 'haproxy',
    algorithm: 'round-robin',
    port: 5432,
    targetPort: 5432,
    healthCheckPath: '/',
    stickySessions: false,
  },
  backup: {
    enabled: true,
    schedule: '0 3 * * *',
    retentionDays: 7,
    storage: 'local',
    encryption: true,
    pointInTimeRecovery: true,
  },
};

describe('HA generation integration', () => {
  it('generates a deployable service topology from a base compose', () => {
    const result = generateHACompose({
      baseCompose: { services: { app: { image: 'my-app:latest' } } },
      haConfig: config,
      projectName: 'integration-test',
      dbCredentials: { dbName: 'app', dbUser: 'postgres', dbPassword: 'secret' },
    });

    expect(result.services.app.image).toBe('my-app:latest');
    expect(result.services['db-primary'].environment.POSTGRESQL_PASSWORD).toBe('secret');
    expect(result.services['db-primary'].image).toBe('bitnamilegacy/postgresql:16');
    expect(result.services['db-replica-1']).toBeDefined();
    expect(result.services['db-replica-2']).toBeDefined();
    expect(result.services['db-replica-1'].environment.POSTGRESQL_REPLICATION_MODE).toBe('slave');
    expect(result.services.pgbouncer).toBeDefined();
    expect(result.services.haproxy).toBeDefined();
    expect(result.services.backup).toBeDefined();
    expect(Object.values(result.networks).every((network: any) => network?.driver !== 'overlay')).toBe(true);
  });

  it('generates matching proxy, pool and backup configuration files', () => {
    const configs = generateAllHAConfigs(config, {
      dbName: 'app',
      dbUser: 'postgres',
      dbPassword: 'secret',
    });

    expect(Object.keys(configs)).toEqual(expect.arrayContaining([
      'haproxy.cfg',
      'pgbouncer.ini',
      'backup.sh',
      'userlist.txt',
    ]));
    expect(configs['pgbouncer.ini']).toContain('host=haproxy');
    expect(configs['pgbouncer.ini']).toContain('pool_mode = transaction');
    expect(configs['pgbouncer.ini']).toContain('listen_port = 6432');
    expect(configs['pgbouncer.ini']).toContain('auth_file');
    expect(configs['haproxy.cfg']).toContain('balance roundrobin');
    expect(configs['haproxy.cfg']).toContain('tcp-check');
    expect(configs['backup.sh']).toContain('pg_dump');
    expect(configs['backup.sh']).toContain('gpg --symmetric');
  });

  it('produces a compose file accepted by the real Compose CLI', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const execFileAsync = promisify(execFile);
    const hasDocker = await execFileAsync('docker', ['compose', 'version'])
      .then(() => true)
      .catch(() => false);
    if (!hasDocker) return;

    const compose = generateHACompose({
      baseCompose: { services: { app: { image: 'my-app:latest' } } },
      haConfig: config,
      projectName: 'integration-test',
      dbCredentials: { dbName: 'app', dbUser: 'postgres', dbPassword: 'secret' },
    });
    const configs = generateAllHAConfigs(config, {
      dbName: 'app',
      dbUser: 'postgres',
      dbPassword: 'secret',
    });

    const directory = await mkdtemp(path.join(tmpdir(), 'expanse-ha-'));
    try {
      for (const [name, content] of Object.entries(configs)) {
        await writeFile(path.join(directory, name), content);
      }
      const file = path.join(directory, 'docker-compose.yaml');
      await writeFile(file, YAML.stringify(compose));

      await expect(execFileAsync('docker', ['compose', '-f', file, 'config', '--quiet']))
        .resolves.toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
