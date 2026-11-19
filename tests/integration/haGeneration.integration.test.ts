/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
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
    expect(result.services.etcd).toBeDefined();
    expect(result.services['db-primary'].environment.POSTGRES_PASSWORD).toBe('secret');
    expect(result.services['db-replica'].deploy.replicas).toBe(2);
    expect(result.services.pgbouncer).toBeDefined();
    expect(result.services.haproxy).toBeDefined();
    expect(result.services.backup).toBeDefined();
    expect(result.networks['expanse-network'].driver).toBe('overlay');
  });

  it('generates matching Patroni, proxy and backup configuration files', () => {
    const configs = generateAllHAConfigs(config, {
      dbName: 'app',
      dbUser: 'postgres',
      dbPassword: 'secret',
    });

    expect(Object.keys(configs)).toEqual(expect.arrayContaining([
      'patroni-primary.yml',
      'patroni-replica.yml',
      'haproxy.cfg',
      'pgbouncer.ini',
      'backup.sh',
    ]));
    expect(configs['patroni-primary.yml']).toContain('db-primary');
    expect(configs['pgbouncer.ini']).toContain('pool_mode = transaction');
    expect(configs['backup.sh']).toContain('--wal-method=fetch');
    expect(configs['backup.sh']).toContain('gpg --symmetric');
  });
});
