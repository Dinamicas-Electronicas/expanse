import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { isDbImage, patchComposeYaml } from '@/lib/dockerCompose';

describe('docker compose integration', () => {
  it('patches a realistic compose document without changing application services', () => {
    const source = `
services:
  database:
    image: postgres:16-alpine
  cache:
    image: redis:7-alpine
  web:
    image: nginx:1.27
    depends_on:
      - database
      - cache
`;

    const patched = YAML.parse(patchComposeYaml(source, {
      resources: {
        web: { cpus: '0.5', memory: '256m' },
      },
    } as any));

    expect(patched.services.database.healthcheck.test[0]).toBe('CMD-SHELL');
    expect(patched.services.database.healthcheck.test[1]).toContain('pg_isready');
    expect(patched.services.cache.healthcheck.test).toEqual(['CMD', 'redis-cli', 'ping']);
    expect(patched.services.web.depends_on).toEqual({
      database: { condition: 'service_healthy' },
      cache: { condition: 'service_healthy' },
    });
    expect(patched.services.web.deploy.resources.limits).toEqual({
      cpus: '0.5',
      memory: '256m',
    });
  });

  it('preserves explicit database healthchecks and handles object dependencies', () => {
    const source = `
services:
  database:
    image: mysql:8
    healthcheck:
      test: ["CMD", "custom-check"]
  web:
    image: nginx
    depends_on:
      database:
        condition: service_started
`;

    const patched = YAML.parse(patchComposeYaml(source));

    expect(patched.services.database.healthcheck.test).toEqual(['CMD', 'custom-check']);
    expect(patched.services.web.depends_on.database.condition).toBe('service_healthy');
  });

  it('recognizes supported database image families and rejects application images', () => {
    expect(isDbImage('postgres:16-alpine')).toBe('postgres');
    expect(isDbImage('mongo:8')).toBe('mongo');
    expect(isDbImage('MONGO:8')).toBe('mongo');
    expect(isDbImage('nginx:latest')).toBeNull();
  });
});

describe('docker compose name validation (real CLI)', () => {
  it('accepts the YAML produced for a stack with parentheses in its name', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');

    const execFileAsync = promisify(execFile);
    const hasDocker = await execFileAsync('docker', ['compose', 'version']).then(() => true).catch(() => false);
    if (!hasDocker) return; // docker is optional for local unit runs

    const directory = await mkdtemp(path.join(tmpdir(), 'expanse-name-'));
    try {
      const yaml = patchComposeYaml(`
services:
  wordpress_full_stack_a1b2:
    image: wordpress:6
    networks:
      - "wordpress(fullstack)_net"
    depends_on:
      - "mysql (db)"
  "mysql (db)":
    image: mysql:8
    networks:
      - "wordpress(fullstack)_net"
networks:
  "wordpress(fullstack)_net":
    driver: bridge
`);
      const file = path.join(directory, 'docker-compose.yaml');
      await writeFile(file, yaml);
      await expect(execFileAsync('docker', ['compose', '-f', file, 'config', '--quiet']))
        .resolves.toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
