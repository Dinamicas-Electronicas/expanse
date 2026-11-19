# Contribuir a Expanse

¡Gracias por tu interés en mejorar Expanse! Este documento describe el flujo de trabajo,
los estándares de código y las convenciones que seguimos.

- **Proyecto:** Expanse — IDE visual para Docker Compose
- **Autor:** Dinámicas Electrónicas
- **Contacto:** [dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com)
- **Licencia:** MIT (ver [LICENSE](LICENSE))

---

## 1. Preparar el entorno

Requisitos:

- Node.js 20+
- pnpm 12
- Docker Engine 20.10+ con Docker Compose v2 (para los tests de integración)
- MongoDB 5.0+ (el `docker-compose.yml` ya lo incluye)

```bash
git clone https://github.com/Dinamicas-Electronicas/expanse.git
cd expanse
pnpm install
pnpm sync-icons      # necesario antes de build / dev si cambió la biblioteca
pnpm dev             # http://localhost:3000
```

Variables de entorno mínimas: `SECRET_KEY` y `MONGODB_URI`. Puedes generarlas con
`pnpm generate-secrets` (crea `.env`). Consulta `.env.example` para el resto.

---

## 2. Flujo de pull requests

1. Haz un fork del repositorio y crea una rama descriptiva:
   `feat/nombre-corto`, `fix/nombre-corto`, `docs/nombre-corto`.
2. Mantén los cambios acotados: un PR = un tema.
3. Añade o actualiza tests cuando cambies comportamiento.
4. Ejecuta las verificaciones locales antes de abrir el PR:

   ```bash
   pnpm lint
   pnpm test
   pnpm typecheck
   pnpm license:check
   ```

   Si tocaste plantillas de `data/library/`, ejecuta también `pnpm test:docker`.
5. Describe el cambio, el problema que resuelve y cómo probarlo.
6. No incluyas `node_modules`, `.next` ni secretos.

Los PR deben pasar CI (`lint`, tests y build de Docker). Revisamos el código con foco en
seguridad, ya que la aplicación opera sobre el socket de Docker.

---

## 3. Estándares de código

- **TypeScript** en modo estricto; evita `any` sin justificación.
- Sigue el estilo del código existente (4 espacios, comillas simples en TS, punto y coma).
- Componentes en `components/`, lógica de servidor en `lib/` y acciones en `actions/`.
- **Server Actions**: toda acción debe llamar a `ensureAuth()` y filtrar por `userId`.
  Nunca exportes helpers privilegiados desde un módulo `'use server'`.
- **Docker**: ejecuta comandos con `execFile` y arrays de argumentos (`lib/dockerExec.ts`),
  nunca con interpolación de shell. Valida IDs con `assertComposeId()`.
- **Nombres de Compose**: usa `sanitizeDockerName()` para servicios, redes y volúmenes.
- **i18n**: añade las cadenas nuevas a `messages/en.json` y `messages/es.json`; usa
  `next-intl` (`useTranslations` / `getTranslations`) y `Link` de `next-intl`.
- **Plantillas**: nuevas plantillas en `data/library/<servicio>.json` siguiendo
  `types/library.ts`. Ejecuta `pnpm sanitize-library` y `pnpm sync-icons` después.

---

## 4. Avisos de autoría

Todos los archivos fuente llevan el aviso de copyright de Dinámicas Electrónicas:

```text
/**
 * Expanse — IDE visual de Docker Compose
 * Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
 *
 * Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
 * Consulta el archivo LICENSE en la raíz del proyecto.
 */
```

Al crear archivos nuevos:

```bash
pnpm license:headers   # añade el aviso de forma idempotente
pnpm license:check     # falla si algún archivo no lo tiene
```

No elimines los avisos existentes y no los apliques a archivos generados
(`next-env.d.ts`, `tsconfig.tsbuildinfo`, iconos o JSON de la biblioteca).

---

## 5. Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(playground): permitir duplicar servicios con Ctrl+D
fix(auth): invalidar sesión al cambiar la contraseña
docs(readme): documentar el despliegue con Docker Run
chore(deps): actualizar next a 15.5.29
```

Tipos habituales: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`,
`security`.

---

## 6. Reportar bugs y proponer ideas

- Usa las plantillas de issue del repositorio (`.github/ISSUE_TEMPLATE/`).
- Incluye versión, sistema operativo, pasos para reproducir y logs relevantes.
- Para vulnerabilidades, **no abras un issue público**: escribe a
  [dinamicas.electronicas@gmail.com](mailto:dinamicas.electronicas@gmail.com).

---

<div align="center">
  <sub>© 2026 Dinámicas Electrónicas — Expanse se distribuye bajo licencia MIT.</sub>
</div>
