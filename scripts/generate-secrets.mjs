/**
 * Expanse — IDE visual de Docker Compose
 * Programa de Dinámicas Electrónicas
 * Contacto: dinamicas.electronicas@gmail.com
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */

import { randomBytes } from 'node:crypto';
import { chmod, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(projectRoot, '.env');
try {
  await access(envPath);
  console.error('.env already exists. Refusing to overwrite existing credentials.');
  process.exit(1);
} catch {
  // The file does not exist and can be created.
}

const secret = randomBytes(32).toString('hex');
const databasePassword = randomBytes(24).toString('base64url');
const contents = [
  '# Generated locally. Never commit this file.',
  'APP_URL=http://localhost:4000',
  'URL=http://localhost:4000',
  'CORE_ONLY=true',
  'DISABLE_TELEMETRY=true',
  'DISABLE_SIGNUP=false',
  'DB_USER=expanse',
  `DB_PASS=${databasePassword}`,
  `SECRET_KEY=${secret}`,
  '',
].join('\n');

await writeFile(envPath, contents, { encoding: 'utf8', mode: 0o600 });
await chmod(envPath, 0o600);
console.log(`Generated ${envPath} with restrictive permissions.`);
