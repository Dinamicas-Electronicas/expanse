/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { DB_HEALTHCHECKS, isDbImage, patchComposeYaml } from '@/lib/dockerCompose';

describe('actions/dockerActions patchComposeYaml', () => {
  describe('isDbImage', () => {
    it('should detect mariadb images', () => {
      expect(isDbImage('mariadb:latest')).toBe('mariadb');
      expect(isDbImage('mariadb:10.6')).toBe('mariadb');
    });

    it('should detect mysql images', () => {
      expect(isDbImage('mysql:8.0')).toBe('mysql');
      expect(isDbImage('mysql:latest')).toBe('mysql');
    });

    it('should detect postgres images', () => {
      expect(isDbImage('postgres:15')).toBe('postgres');
      expect(isDbImage('postgres:16-alpine')).toBe('postgres');
    });

    it('should detect mongodb images', () => {
      expect(isDbImage('mongo:8.2-rc-noble')).toBe('mongo');
      expect(isDbImage('mongodb:latest')).toBe('mongo');
    });

    it('should detect redis images', () => {
      expect(isDbImage('redis:7-alpine')).toBe('redis');
      expect(isDbImage('redis:latest')).toBe('redis');
    });

    it('should return null for non-DB images', () => {
      expect(isDbImage('nginx:latest')).toBe(null);
      expect(isDbImage('nginx:1.25')).toBe(null);
      expect(isDbImage('wordpress:latest')).toBe(null);
    });

    it('should be case insensitive', () => {
      expect(isDbImage('POSTGRES:15')).toBe('postgres');
      expect(isDbImage('Redis:7-alpine')).toBe('redis');
    });
  });

  describe('patchComposeYaml - healthcheck injection', () => {
    it('should inject healthcheck for postgres service', () => {
      const yaml = `
services:
  db:
    image: postgres:15
`;
      const result = patchComposeYaml(yaml);
      expect(result).toContain('healthcheck');
      expect(result).toContain('pg_isready');
      expect(YAML.parse(result).services.db.healthcheck).toEqual(DB_HEALTHCHECKS.postgres);
    });

    it('should inject healthcheck for redis service', () => {
      const yaml = `
services:
  cache:
    image: redis:7-alpine
`;
      const result = patchComposeYaml(yaml);
      expect(result).toContain('healthcheck');
      expect(result).toContain('redis-cli');
    });

    it('should not override existing healthcheck', () => {
      const yaml = `
services:
  db:
    image: postgres:15
    healthcheck:
      test: ["CMD", "pg_isready"]
`;
      const result = patchComposeYaml(yaml);
      const parsed = YAML.parse(result);
      expect(parsed.services.db.healthcheck.test).toEqual(['CMD', 'pg_isready']);
    });

    it('should leave documents without services untouched', () => {
      const yaml = 'networks:\n  backend:\n    driver: bridge\n';
      expect(patchComposeYaml(yaml)).toBe(yaml);
    });
  });

  describe('patchComposeYaml - depends_on upgrade', () => {
    it('should upgrade depends_on array to object with service_healthy', () => {
      const yaml = `
services:
  web:
    image: nginx
    depends_on:
      - db
  db:
    image: postgres:15
`;
      const result = patchComposeYaml(yaml);
      const parsed = YAML.parse(result);
      expect(parsed.services.web.depends_on).toEqual({
        db: { condition: 'service_healthy' },
      });
    });

    it('should not upgrade non-DB dependencies', () => {
      const yaml = `
services:
  web:
    image: nginx
    depends_on:
      - proxy
  proxy:
    image: nginx:alpine
`;
      const result = patchComposeYaml(yaml);
      const parsed = YAML.parse(result);
      expect(parsed.services.web.depends_on).toEqual({
        proxy: { condition: 'service_started' },
      });
    });
  });

  describe('patchComposeYaml - resource limits', () => {
    it('should inject resource limits from metadata', () => {
      const yaml = `
services:
  web:
    image: nginx
`;
      const metadata = {
        resources: {
          web: { cpus: '0.5', memory: '512m' },
        },
      };
      const result = patchComposeYaml(yaml, metadata as any);
      const parsed = YAML.parse(result);
      expect(parsed.services.web.deploy.resources.limits).toEqual({
        cpus: '0.5',
        memory: '512m',
      });
    });

    it('should not add deploy section if no resources', () => {
      const yaml = `
services:
  web:
    image: nginx
`;
      const result = patchComposeYaml(yaml, {} as any);
      const parsed = YAML.parse(result);
      expect(parsed.services.web.deploy).toBeUndefined();
    });
  });

  describe('patchComposeYaml - invalid names', () => {
    it('normalizes invalid service and network keys before deployment', () => {
      const yaml = `
services:
  "WordPress (Full Stack)":
    image: wordpress
    networks:
      - "wordpress(fullstack)_net"
networks:
  "wordpress(fullstack)_net":
    driver: bridge
`;
      const parsed = YAML.parse(patchComposeYaml(yaml));
      expect(Object.keys(parsed.services)).toEqual(['wordpress_full_stack']);
      expect(Object.keys(parsed.networks)).toEqual(['wordpress_fullstack_net']);
      expect(parsed.services.wordpress_full_stack.networks).toEqual(['wordpress_fullstack_net']);
    });
  });
});
