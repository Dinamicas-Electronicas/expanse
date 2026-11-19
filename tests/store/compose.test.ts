import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Translator } from 'expanse-docker-lib';
import type { TemplateService } from '@/types/library';

// The store imports server actions; they are irrelevant for naming tests and
// would pull `next/headers` into the jsdom environment.
vi.mock('@/actions/userActions', () => ({
  registerCompose: vi.fn(async () => '6aff14b3f3ec933fa297d865'),
}));

vi.mock('@/lib/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/metadata')>();
  return { ...actual, extractMetadata: vi.fn(() => ({})) };
});

function loadTemplate(name: string): TemplateService {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), 'data/library', name), 'utf8'));
}

const DOCKER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

describe('store/compose addServiceFromTemplate', () => {
  beforeEach(async () => {
    const { useComposeStore } = await import('@/store/compose');
    useComposeStore.getState().resetCompose();
  });

  it('creates valid service and network keys for names with parentheses', async () => {
    const { useComposeStore } = await import('@/store/compose');
    const template = loadTemplate('wordpress-full.json');

    await useComposeStore.getState().addServiceFromTemplate(template);

    const dict = new Translator(useComposeStore.getState().compose).toDict() as any;
    const serviceKeys = Object.keys(dict.services);
    const networkKeys = Object.keys(dict.networks ?? {});

    expect(serviceKeys.length).toBeGreaterThan(1);
    expect(networkKeys).toHaveLength(1);
    for (const key of [...serviceKeys, ...networkKeys]) {
      expect(key, `${key} is not a valid Compose key`).toMatch(DOCKER_NAME);
    }
    // This is the key that used to make `docker compose up` fail:
    // "networks additional properties 'wordpress(fullstack)_net' not allowed"
    expect(networkKeys[0]).toBe('wordpress_full_stack_net');

    // Every service must reference the same, valid network
    for (const service of Object.values<any>(dict.services)) {
      expect(service.networks).toEqual([networkKeys[0]]);
    }
  });

  it('keeps hyphens in related service names so env references resolve', async () => {
    const { useComposeStore } = await import('@/store/compose');
    const template = loadTemplate('ai-stack.json');

    await useComposeStore.getState().addServiceFromTemplate(template);
    const dict = new Translator(useComposeStore.getState().compose).toDict() as any;

    const services = Object.keys(dict.services);
    expect(services.some((name) => name.startsWith('open-webui'))).toBe(true);
    expect(services).toContain('qdrant');
  });

  it('never emits invalid keys for any stack template in the library', async () => {
    const { useComposeStore } = await import('@/store/compose');
    const { readdirSync } = await import('node:fs');

    const stackFiles = readdirSync(path.resolve(process.cwd(), 'data/library'))
      .filter((file) => file.endsWith('.json'));

    for (const file of stackFiles) {
      const template = loadTemplate(file);
      useComposeStore.getState().resetCompose();
      await useComposeStore.getState().addServiceFromTemplate(template);
      const dict = new Translator(useComposeStore.getState().compose).toDict() as any;

      for (const key of [...Object.keys(dict.services), ...Object.keys(dict.networks ?? {})]) {
        expect(key, `${file} produced invalid key "${key}"`).toMatch(DOCKER_NAME);
      }
    }
  }, 60_000);
});
