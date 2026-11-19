/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { sanitizeDockerName } from '@/lib/dockerCompose';

const execFileAsync = promisify(execFile);
const libraryDir = path.resolve(process.cwd(), 'data/library');
const dockerSmokeEnabled = process.env.RUN_DOCKER_SMOKE === 'true';
const dockerAllEnabled = process.env.RUN_DOCKER_ALL === 'true';

async function cleanupDockerCache() {
  await Promise.all([
    execFileAsync('docker', ['builder', 'prune', '--force'], { timeout: 120_000 }).catch(() => undefined),
    execFileAsync('docker', ['image', 'prune', '--force'], { timeout: 120_000 }).catch(() => undefined),
  ]);
}

type Template = {
  name: string;
  image: string;
  env_vars?: Record<string, string>;
  default_ports?: string[];
  volumes?: string[];
  related_services?: Array<Template & {
    deploy?: Record<string, unknown>;
    healthcheck?: Record<string, unknown>;
    depends_on?: Record<string, unknown> | string[];
  }>;
};

function serviceFromTemplate(template: Template, { stripPorts = false } = {}) {
  return {
    image: template.image,
    environment: template.env_vars,
    // Smoke tests only assert that containers run; publishing host ports makes
    // them collide with services the developer already has running.
    ports: stripPorts ? undefined : (template.default_ports ?? (template as Template & { ports?: string[] }).ports),
    volumes: template.volumes,
    command: (template as Template & { command?: string | string[] }).command,
  };
}

/**
 * Mirrors `store/compose.ts`: service keys and stack networks are normalized
 * with the same helper the app uses. Before that helper existed, a stack named
 * "WordPress (Full Stack)" produced the invalid network key
 * `wordpress(fullstack)_net` and `docker compose up` failed.
 */
function serviceKey(name: string) {
  return sanitizeDockerName(name, 'service');
}

function composeFromTemplate(template: Template, suffix = 'local', options: { stripPorts?: boolean } = {}) {
  const related = template.related_services ?? [];
  const networkName = related.length ? `${sanitizeDockerName(template.name, 'stack')}_net` : undefined;
  const networks = networkName ? { networks: [networkName] } : {};

  const services: Record<string, any> = {
    [`${serviceKey(template.name)}_${suffix}`]: {
      ...serviceFromTemplate(template, options),
      ...networks,
    },
  };

  for (const service of related) {
    services[serviceKey(service.name)] = {
      ...serviceFromTemplate(service, options),
      ...networks,
      deploy: service.deploy,
      healthcheck: service.healthcheck,
      depends_on: service.depends_on && !Array.isArray(service.depends_on)
        ? Object.fromEntries(Object.entries(service.depends_on).map(([name, condition]) => [serviceKey(name), condition]))
        : service.depends_on?.map(serviceKey),
    };
  }

  const volumes = Object.values(services)
    .flatMap((service: any) => service.volumes ?? [])
    .map((volume: string) => volume.split(':')[0])
    .filter((volume: string) => volume && !volume.startsWith('.') && !volume.startsWith('/'));

  return {
    services,
    ...(networkName ? { networks: { [networkName]: { driver: 'bridge' } } } : {}),
    ...(volumes.length ? { volumes: Object.fromEntries([...new Set(volumes)].map((volume) => [volume, {}])) } : {}),
  };
}

async function loadTemplates(): Promise<Template[]> {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(libraryDir);
  return Promise.all(entries.filter((entry) => entry.endsWith('.json')).map(async (entry) => (
    JSON.parse(await readFile(path.join(libraryDir, entry), 'utf8'))
  )));
}

async function writeComposeFile(directory: string, template: Template, options: { stripPorts?: boolean } = {}) {
  const file = path.join(directory, `${template.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.yml`);
  await writeFile(file, YAML.stringify(composeFromTemplate(template, 'local', options)));
  return file;
}

async function runCompose(project: string, file: string, ...args: string[]) {
  return execFileAsync('docker', ['compose', '-p', project, '-f', file, ...args], {
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

async function imageExists(image: string) {
  try {
    await execFileAsync('docker', ['image', 'inspect', image], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

async function assertServicesRunning(project: string, file: string) {
  const { stdout } = await runCompose(project, file, 'ps', '-a', '--format', 'json');
  const services = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  expect(services.length, `${project} produced no containers`).toBeGreaterThan(0);
  expect(services.every((service) => service.State === 'running'), stdout).toBe(true);
}

describe('Docker template integration', () => {
  it('renders every library template as valid Compose configuration', async () => {
    const templates = await loadTemplates();
    const directory = await mkdtemp(path.join(tmpdir(), 'expanse-template-config-'));

    try {
      expect(templates.length).toBeGreaterThan(100);
      for (const template of templates) {
        const file = await writeComposeFile(directory, template);
        await expect(runCompose(`expanse-config-${template.name.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}`, file, 'config', '--quiet'))
          .resolves.toBeDefined();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);

  const smoke = dockerSmokeEnabled ? it : it.skip;

  smoke('starts and stops representative templates', async () => {
    const templates = await loadTemplates();
    const selected = templates.filter((template) => ['Redis', 'PostgreSQL'].includes(template.name));
    const directory = await mkdtemp(path.join(tmpdir(), 'expanse-template-smoke-'));
    const projects: string[] = [];
    const imagesBefore = new Set<string>();

    try {
      expect(selected.length).toBe(2);
      for (const template of selected) {
        const project = `expanse-smoke-${template.name.toLowerCase()}`;
        const file = await writeComposeFile(directory, template, { stripPorts: true });
        projects.push(project);
        if (await imageExists(template.image)) imagesBefore.add(template.image);
        await runCompose(project, file, 'up', '-d');
        await assertServicesRunning(project, file);
      }
    } finally {
      await Promise.all(projects.map(async (project) => {
        try {
          await execFileAsync('docker', ['compose', '-p', project, 'down', '--volumes', '--remove-orphans'], {
            timeout: 120_000,
          });
        } catch {
          // Cleanup must not hide the original smoke-test failure.
        }
      }));
      await Promise.all(selected
        .filter((template) => !imagesBefore.has(template.image))
        .map((template) => execFileAsync('docker', ['image', 'rm', template.image], { timeout: 120_000 }).catch(() => undefined)));
      await rm(directory, { recursive: true, force: true });
      await cleanupDockerCache();
    }
  }, 600_000);

  const allSmoke = dockerAllEnabled ? it : it.skip;

  allSmoke('starts and stops every library template', async () => {
    const templates = await loadTemplates();
    const directory = await mkdtemp(path.join(tmpdir(), 'expanse-template-all-'));
    const failures: string[] = [];

    try {
      expect(templates.length).toBeGreaterThan(100);
      for (const [index, template] of templates.entries()) {
        const project = `expanse-all-${index}`;
        const file = await writeComposeFile(directory, template, { stripPorts: true });
        const images = Object.values(composeFromTemplate(template).services)
          .map((service) => service.image)
          .filter((image): image is string => Boolean(image));
        const imagesBefore = new Set<string>();
        for (const image of images) {
          if (await imageExists(image)) imagesBefore.add(image);
        }
        try {
          await runCompose(project, file, 'up', '-d');
          await assertServicesRunning(project, file);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${template.name}: ${message.slice(0, 500)}`);
        } finally {
          await execFileAsync('docker', ['compose', '-p', project, 'down', '--volumes', '--remove-orphans'], {
            timeout: 120_000,
          }).catch(() => undefined);
          await Promise.all(images
            .filter((image) => !imagesBefore.has(image))
            .map((image) => execFileAsync('docker', ['image', 'rm', image], { timeout: 120_000 }).catch(() => undefined)));
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
      await cleanupDockerCache();
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 3_600_000);
});
