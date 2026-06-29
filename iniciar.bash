#!/usr/bin/env bash
# ============================================================
#  V's Card Creator — Arranque con un solo clic
#  - Instala dependencias (solo la primera vez)
#  - Construye la app
#  - Arranca el servidor (frontend + API en el mismo puerto)
#  - Deja activo el acceso por Tailscale (IP + HTTPS si es posible)
# ============================================================
set -e

# Ir siempre a la carpeta donde está este script
cd "$(dirname "$0")"

PORT="${PORT:-3001}"
export PORT
export NODE_ENV=production

echo "=================================================="
echo "   V's Card Creator"
echo "=================================================="

# 1) Comprobar Node.js / npm
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no esta instalado."
  echo "        Descargalo de https://nodejs.org (version 18 o superior)."
  read -r -p "Pulsa Enter para salir..."
  exit 1
fi
echo "[OK] Node $(node -v)"

# 2) Instalar dependencias si faltan
if [ ! -d "node_modules" ]; then
  echo "[..] Instalando dependencias por primera vez (puede tardar)..."
  npm install
else
  echo "[OK] Dependencias ya instaladas"
fi

# 3) Construir el frontend
echo "[..] Construyendo la aplicacion..."
npm run build

# 4) Detectar Tailscale y dejar activo el acceso remoto
TS_BIN=""
if command -v tailscale >/dev/null 2>&1; then
  TS_BIN="tailscale"
elif [ -x "/c/Program Files/Tailscale/tailscale.exe" ]; then
  TS_BIN="/c/Program Files/Tailscale/tailscale.exe"
elif [ -x "/c/Program Files (x86)/Tailscale/tailscale.exe" ]; then
  TS_BIN="/c/Program Files (x86)/Tailscale/tailscale.exe"
fi

TS_IP=""
TS_HOST=""
TS_HTTPS=""
if [ -n "$TS_BIN" ]; then
  echo "[OK] Tailscale detectado"
  TS_IP="$("$TS_BIN" ip -4 2>/dev/null | head -n1 || true)"
  TS_HOST="$("$TS_BIN" status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | head -n1 | sed 's/.*:"//; s/"$//; s/\.$//' || true)"

  # Intentar exponer por HTTPS dentro del tailnet (best-effort, varias sintaxis)
  echo "[..] Activando acceso por Tailscale..."
  if "$TS_BIN" serve --bg "${PORT}" >/dev/null 2>&1 \
     || "$TS_BIN" serve --bg "http://127.0.0.1:${PORT}" >/dev/null 2>&1 \
     || "$TS_BIN" serve --bg --https=443 "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    [ -n "$TS_HOST" ] && TS_HTTPS="https://${TS_HOST}"
    echo "[OK] Tailscale serve activado"
  else
    echo "[i] No se pudo activar 'tailscale serve' (se usara la IP directa)."
  fi
else
  echo "[i] Tailscale no detectado. La app seguira disponible en tu red local."
  echo "    Instala Tailscale desde https://tailscale.com/download para acceso remoto."
fi

# Limpiar la configuracion de tailscale serve al cerrar
cleanup() {
  if [ -n "$TS_BIN" ]; then
    "$TS_BIN" serve --bg off >/dev/null 2>&1 || "$TS_BIN" serve reset >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo ""
echo "=================================================="
echo "  La aplicacion esta corriendo. Abrela en:"
echo "    - Local:           http://localhost:${PORT}"
[ -n "$TS_IP" ]    && echo "    - Tailscale (IP):  http://${TS_IP}:${PORT}"
[ -n "$TS_HTTPS" ] && echo "    - Tailscale HTTPS: ${TS_HTTPS}"
echo ""
echo "  Deja esta ventana abierta. Pulsa Ctrl+C para detener."
echo "=================================================="
echo ""

# 5) Arrancar el servidor (sirve frontend + API en 0.0.0.0:PORT)
node server/index.js
