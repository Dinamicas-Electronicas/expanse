#!/usr/bin/env bash
# Expanse — IDE visual de Docker Compose
# Programa de Dinámicas Electrónicas
# Contacto: dinamicas.electronicas@gmail.com
# Copyright (c) 2026 Dinámicas Electrónicas <dinamicas.electronicas@gmail.com>
#
# Este archivo es parte de Expanse y se distribuye bajo la licencia MIT.
# Consulta el archivo LICENSE en la raíz del proyecto.
# Smoke test de Expanse.
# Uso: ./scripts/smoke-test.sh [http://127.0.0.1:4000]
set -uo pipefail

BASE="${1:-http://127.0.0.1:4000}"
PASS=0
FAIL=0

c_green() { printf '\033[32m%s\033[0m' "$1"; }
c_red() { printf '\033[31m%s\033[0m' "$1"; }

ok() { PASS=$((PASS + 1)); printf '  %s %s\n' "$(c_green '✓')" "$1"; }
ko() { FAIL=$((FAIL + 1)); printf '  %s %s  (%s)\n' "$(c_red '✗')" "$1" "${2:-}"; }

status() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null || echo "000"
}

location() {
  curl -s -o /dev/null -w '%{redirect_url}' --max-time 15 "$1" 2>/dev/null || true
}

expect_status() {
  local name="$1" url="$2" want="$3" got
  got="$(status "$url")"
  if [[ "$got" == "$want" ]]; then ok "$name → $got"; else ko "$name" "esperado $want, obtenido $got"; fi
}

echo "Expanse smoke test · $BASE"
echo

echo "Contenedores"
if command -v docker >/dev/null 2>&1; then
  state="$(docker inspect -f '{{.State.Status}}' expanse-app-1 2>/dev/null || echo missing)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' expanse-app-1 2>/dev/null || echo missing)"
  if [[ "$state" == "running" && "$health" == "healthy" ]]; then
    ok "app running/healthy"
  else
    ko "app" "estado=$state salud=$health"
  fi
  db_state="$(docker inspect -f '{{.State.Status}}' expanse-db-1 2>/dev/null || echo missing)"
  db_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' expanse-db-1 2>/dev/null || echo missing)"
  if [[ "$db_state" == "running" && "$db_health" == "healthy" ]]; then
    ok "db running/healthy"
  else
    ko "db" "estado=$db_state salud=$db_health"
  fi
else
  echo "  (docker no disponible, se omiten comprobaciones de contenedores)"
fi

echo
echo "Aplicación"
body="$(curl -s --max-time 15 "$BASE/api/ping" 2>/dev/null || true)"
if [[ "$body" == *pong* ]]; then ok "/api/ping responde pong"; else ko "/api/ping" "respuesta: ${body:-vacía}"; fi
expect_status "GET /en" "$BASE/en" 200
expect_status "GET /en/login" "$BASE/en/login" 200
expect_status "GET /robots.txt" "$BASE/robots.txt" 200
expect_status "GET /en/nonexistent (404 propio)" "$BASE/en/nonexistent" 404

echo
echo "Protección de rutas (sin sesión)"
expect_status "GET /en/dashboard" "$BASE/en/dashboard" 307
expect_status "GET /en/deploy/settings" "$BASE/en/deploy/settings" 307
loc="$(location "$BASE/fr/dashboard")"
if [[ "$loc" == *"/en/fr/dashboard"* ]]; then ok "locale no soportado redirigido ($loc)"; else ko "/fr/dashboard" "redirect: ${loc:-ninguno}"; fi

echo
echo "APIs endurecidas"
expect_status "GET /api/compose?id=nope" "$BASE/api/compose?id=nope" 400
expect_status "GET /api/export/png?shareId=nope" "$BASE/api/export/png?shareId=nope" 400
expect_status "GET /api/logos/library/nginx" "$BASE/api/logos/library/nginx" 200

echo
echo "Cabeceras de seguridad"
headers="$(curl -sI --max-time 15 "$BASE/en" 2>/dev/null || true)"
for h in "x-content-type-options" "x-frame-options" "referrer-policy" "permissions-policy" "cross-origin-opener-policy"; do
  if grep -qi "^$h:" <<<"$headers"; then ok "$h presente"; else ko "$h" "cabecera ausente"; fi
done

echo
if [[ "$FAIL" -eq 0 ]]; then
  printf '%s  %d comprobaciones OK\n' "$(c_green 'RESULTADO:')" "$PASS"
  exit 0
else
  printf '%s  %d OK, %d fallos\n' "$(c_red 'RESULTADO:')" "$PASS" "$FAIL"
  exit 1
fi
