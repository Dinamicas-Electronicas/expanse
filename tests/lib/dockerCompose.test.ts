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
  DOCKER_NAME_PATTERN,
  isValidDockerName,
  normalizeComposeNames,
  patchComposeYaml,
  sanitizeDockerName,
  uniqueDockerName,
} from '@/lib/dockerCompose';

describe('sanitizeDockerName', () => {
  it('keeps already valid names untouched', () => {
    expect(sanitizeDockerName('postgres_ha')).toBe('postgres_ha');
    expect(sanitizeDockerName('expanse-network')).toBe('expanse-network');
    expect(sanitizeDockerName('redis.cache')).toBe('redis.cache');
  });

  it('fixes the "WordPress (Fullstack)" regression', () => {
    const network = `${sanitizeDockerName('WordPress (Fullstack)', 'stack')}_net`;
    expect(network).toBe('wordpress_fullstack_net');
    expect(DOCKER_NAME_PATTERN.test(network)).toBe(true);
  });

  it('removes accents, slashes, emoji and other unsupported characters', () => {
    expect(sanitizeDockerName('Aplicación / v2')).toBe('aplicacion_v2');
    expect(sanitizeDockerName('My App 🚀 (prod)')).toBe('my_app_prod');
    expect(sanitizeDockerName('  --weird--  ')).toBe('weird');
  });

  it('never returns an empty or leading-separator name', () => {
    expect(sanitizeDockerName('()')).toBe('service');
    expect(sanitizeDockerName('')).toBe('service');
    expect(sanitizeDockerName(null, 'fallback')).toBe('fallback');
    for (const value of ['()', '___', '--', '!!!', 'áéí', 'a b c']) {
      const name = sanitizeDockerName(value);
      expect(name).not.toBe('');
      expect(DOCKER_NAME_PATTERN.test(name)).toBe(true);
    }
  });

  it('caps names at 63 characters', () => {
    const name = sanitizeDockerName('a'.repeat(200));
    expect(name.length).toBeLessThanOrEqual(63);
    expect(isValidDockerName(name)).toBe(true);
  });
});

describe('isValidDockerName', () => {
  it('rejects parentheses and other compose-invalid characters', () => {
    expect(isValidDockerName('wordpress(fullstack)_net')).toBe(false);
    expect(isValidDockerName('wordpress_fullstack_net')).toBe(true);
    expect(isValidDockerName('_leading')).toBe(false);
    expect(isValidDockerName('')).toBe(false);
    expect(isValidDockerName(undefined)).toBe(false);
  });
});

describe('uniqueDockerName', () => {
  it('appends numeric suffixes until the name is free', () => {
    const taken = new Set(['db', 'db_2']);
    expect(uniqueDockerName('db', taken)).toBe('db_3');
    expect(uniqueDockerName('cache', taken)).toBe('cache');
  });
});

describe('normalizeComposeNames', () => {
  it('renames invalid networks and keeps service references in sync', () => {
    const doc = normalizeComposeNames<any>({
      services: {
        app: { image: 'nginx', networks: ['wordpress(fullstack)_net'] },
        app2: { image: 'redis', networks: { 'wordpress(fullstack)_net': { aliases: ['cache'] } } },
      },
      networks: { 'wordpress(fullstack)_net': { driver: 'bridge' } },
    });

    expect(Object.keys(doc.networks)).toEqual(['wordpress_fullstack_net']);
    expect(doc.services.app.networks).toEqual(['wordpress_fullstack_net']);
    expect(doc.services.app2.networks).toEqual({
      wordpress_fullstack_net: { aliases: ['cache'] },
    });
  });

  it('renames invalid volumes and updates shorthand mounts', () => {
    const doc = normalizeComposeNames<any>({
      services: {
        app: { image: 'postgres', volumes: ['my data:/var/lib/postgresql/data', './local:/local'] },
      },
      volumes: { 'my data': { driver: 'local' } },
    });

    expect(Object.keys(doc.volumes)).toEqual(['my_data']);
    expect(doc.services.app.volumes).toEqual([
      'my_data:/var/lib/postgresql/data',
      './local:/local',
    ]);
  });

  it('renames invalid services and updates depends_on/links/extends', () => {
    const doc = normalizeComposeNames<any>({
      services: {
        'Web App': { image: 'nginx', depends_on: ['DB (primary)'] },
        'DB (primary)': {
          image: 'postgres',
          links: ['Web App:web'],
          extends: { service: 'Web App' },
        },
        proxy: { image: 'traefik', network_mode: 'service:Web App' },
      },
    });

    expect(Object.keys(doc.services)).toEqual(['web_app', 'db_primary', 'proxy']);
    expect(doc.services.web_app.depends_on).toEqual(['db_primary']);
    expect(doc.services.db_primary.links).toEqual(['web_app:web']);
    expect(doc.services.db_primary.extends.service).toBe('web_app');
    expect(doc.services.proxy.network_mode).toBe('service:web_app');
  });

  it('avoids collisions when two different labels normalize to the same key', () => {
    const doc = normalizeComposeNames<any>({
      services: { 'App (1)': { image: 'a' }, 'App [1]': { image: 'b' } },
    });
    expect(Object.keys(doc.services).sort()).toEqual(['app_1', 'app_1_2']);
  });

  it('is a no-op for an already valid document', () => {
    const source = {
      services: { db: { image: 'postgres', networks: ['backend'] } },
      networks: { backend: { driver: 'bridge' } },
    };
    expect(normalizeComposeNames(structuredClone(source))).toEqual(source);
  });
});

describe('patchComposeYaml name normalization', () => {
  it('produces a compose document with valid keys for stack names with parentheses', () => {
    const source = `
services:
  wordpress_fullstack_a1b2:
    image: wordpress:latest
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
`;
    const patched = YAML.parse(patchComposeYaml(source));

    for (const key of Object.keys(patched.networks)) {
      expect(DOCKER_NAME_PATTERN.test(key)).toBe(true);
    }
    for (const key of Object.keys(patched.services)) {
      expect(DOCKER_NAME_PATTERN.test(key)).toBe(true);
    }
    expect(patched.services.wordpress_fullstack_a1b2.networks).toEqual(['wordpress_fullstack_net']);
    expect(patched.services.wordpress_fullstack_a1b2.depends_on).toEqual({
      mysql_db: { condition: 'service_healthy' },
    });
    expect(patched.services.mysql_db.networks).toEqual(['wordpress_fullstack_net']);
  });
});
