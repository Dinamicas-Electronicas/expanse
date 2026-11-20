/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { describe, expect, it } from 'vitest';
import { getLibraryServices } from '@/actions/libraryActions';

describe('library integration', () => {
  it('loads the checked-in service catalog with valid records', async () => {
    const services = await getLibraryServices();

    expect(services.length).toBeGreaterThan(100);
    expect(services.every((service) => service.name && service.category)).toBe(true);
  });

  it('returns the catalog in category and popularity order', async () => {
    const services = await getLibraryServices();
    const databaseIndexes = services
      .map((service, index) => service.category === 'Database' ? index : -1)
      .filter((index) => index >= 0);
    const nonDatabaseIndexes = services
      .map((service, index) => service.category === 'Database' ? -1 : index)
      .filter((index) => index >= 0);

    expect(databaseIndexes.length).toBeGreaterThan(0);
    expect(Math.max(...databaseIndexes)).toBeLessThan(Math.min(...nonDatabaseIndexes));
  });

  it('loads HA templates with the fields required by the HA flow', async () => {
    const services = await getLibraryServices();
    const haTemplates = services.filter((service) => service.haEnabled && service.databaseHA);

    expect(haTemplates.length).toBeGreaterThanOrEqual(4);
    expect(haTemplates.every((service) => service.databaseHA?.replication)).toBe(true);
  });
});
