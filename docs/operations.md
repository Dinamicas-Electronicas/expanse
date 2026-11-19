# Operaciones — Expanse

Guía de backup, restauración, migraciones y respuesta a incidentes. Complementa
[`SDD.md`](SDD.md) y el README.

## 1. Backup de MongoDB

El estado vive en MongoDB (proyectos, usuarios, shares y auditoría).

```bash
# Copia lógica (recomendada antes de actualizar)
docker compose exec -T db mongodump \
  --username "$DB_USER" --password "$DB_PASS" --authenticationDatabase admin \
  --archive=/tmp/expanse-$(date +%F).archive --gzip

docker compose cp db:/tmp/expanse-$(date +%F).archive ./backups/
```

Programa una copia diaria (host o cron) y **prueba la restauración** al menos una vez
por trimestre:

```bash
docker compose exec -T db mongorestore \
  --username "$DB_USER" --password "$DB_PASS" --authenticationDatabase admin \
  --archive=/tmp/expanse-YYYY-MM-DD.archive --gzip --drop
```

### Volúmenes

- `expanse_db_data`: datos de MongoDB. Su backup debe hacerse con `mongodump`, no copiando
  el directorio en caliente.
- `expanse_exports`: miniaturas PNG. No es crítico; se regeneran al guardar.

## 2. Retención

Variables (ver `.env.example`):

| Variable | Por defecto | Efecto |
|---|---:|---|
| `EXPORT_RETENTION_DAYS` | 7 | Elimina PNG de `public/exports` más antiguos. |
| `TMP_RETENTION_DAYS` | 7 | Elimina `/tmp/expanse-*` antiguos. |
| `SHARE_TTL_DAYS` | 30 | Caducidad de enlaces compartidos (`0` = nunca). |
| `audit_log` | 90 días | TTL de MongoDB. |

La limpieza corre al arrancar (tras 10 min) y cada 24 h.

## 3. Migraciones

### Emails en minúsculas

El registro y el login normalizan a minúsculas. Antes de crear el índice único
`users.email` en una base antigua con mayúsculas, usa el script incluido (hace primero un
dry-run y **se niega** si hay colisiones):

```bash
MONGODB_URI="mongodb://…" pnpm migrate:emails
MONGODB_URI="mongodb://…" pnpm migrate:emails -- --apply
```

Si el dry-run detecta dos cuentas que colisionarían, resuelve el duplicado manualmente
antes de aplicar. El índice único se crea de forma idempotente al arrancar
(`lib/dbIndexes.ts`). Si falla por duplicados, el error queda en los logs y la app sigue
arrancando.

### `sessionVersion`

Los usuarios antiguos sin campo se tratan como versión `0`; no requieren migración.
Al resetear contraseña o usar «cerrar sesión en todos los dispositivos» se incrementa.

### Shares antiguos

Los shares sin `expiresAt` se consideran permanentes (compatibilidad). Los nuevos usan
`SHARE_TTL_DAYS`. Para forzar caducidad a los antiguos:

```js
db.shares.updateMany(
  { expiresAt: { $exists: false } },
  { $set: { expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 } },
)
```

## 4. Rotación de secretos

| Secreto | Procedimiento |
|---|---|
| `SECRET_KEY` | Cámbialo y reinicia; **invalida todas las sesiones**. Si MFA usa el fallback de `SECRET_KEY`, define antes un `MFA_ENCRYPTION_KEY` estable para no invalidar los secretos TOTP. |
| `MFA_ENCRYPTION_KEY` | No lo cambies sin desactivar MFA; si se pierde, los usuarios pueden recuperar la cuenta con «olvidé mi contraseña» (el reset limpia MFA). |
| `GITHUB_CLIENT_SECRET` | Rótalo en GitHub y actualiza el entorno. |
| `BREVO_API_KEY` | Rótalo en Brevo. |
| `DB_PASS` | Cambia la contraseña en Mongo y actualiza `MONGODB_URI`/compose. |

## 5. Respuesta a incidentes

1. **Contén**: `docker compose stop app` (los stacks desplegados siguen corriendo).
2. **Revisa** `audit_log`:
   ```js
   db.audit_log.find().sort({ createdAt: -1 }).limit(100)
   ```
   Busca `action` sospechosa (`container.exec`, `project.remove`, `account.delete`).
3. **Rota** `SECRET_KEY` y credenciales OAuth/Brevo; reinicia.
4. **Revisa** logs del contenedor (rotación `json-file`, 10 MB × 5).
5. **Restaura** el último backup si hubo pérdida de datos y documenta el incidente.

## 6. Riesgo del socket Docker

La app monta `/var/run/docker.sock` y puede ejecutar comandos en contenedores. Por diseño,
una cuenta autenticada equivale a administrador del host. Para reducir el riesgo:

- `DISABLE_SIGNUP=true` tras crear el primer admin.
- HTTPS + `URL=https://…`.
- `ALLOW_HOST_PROJECT_OPS=false` y `ALLOW_COMPOSE_HOST_ACCESS=false` salvo necesidad.
- Valora un `docker-socket-proxy` con allowlist de endpoints (P2 del SDD).
