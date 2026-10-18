#!/usr/bin/env bash
# Ignored Build Step de los proyectos de Vercel conectados a Git (ignoreCommand de
# apps/web-*/vercel.json). Vercel lo corre desde la carpeta de la app.
# exit 0 = no construir; exit 1 = construir.
#
# Los deploys de deploy-staging.yml y deploy-production.yml usan la CLI (vercel build +
# deploy --prebuilt) y no pasan por acá.
set -u

# Producción: menyu-admin, menyu-cliente y menyu-staff se despliegan con el tag
# (deploy-production.yml), nunca desde Git; en el panel de Vercel ya tenían un Ignored Build
# Step que cancelaba los builds de main, y este archivo lo reemplaza. menyu-cliente-staging
# usa el mismo vercel.json que menyu-cliente y sí despliega main. VERCEL_URL empieza con el
# nombre del proyecto (<proyecto>-<hash>-<equipo>.vercel.app).
if [ "${VERCEL_ENV:-}" = "production" ]; then
  case "${VERCEL_URL:-}" in
    menyu-cliente-staging-*) ;;
    *)
      echo "Producción se despliega con el tag (deploy-production.yml): no se construye desde Git."
      exit 0
      ;;
  esac
fi

# Primer deploy de una rama: Vercel no manda VERCEL_GIT_PREVIOUS_SHA. Se compara contra el
# punto donde la rama salió de main; si no se puede calcular (clon poco profundo, sin red),
# turbo-ignore no tiene con qué comparar y construye.
fallback=()
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ] \
  && git fetch --quiet --depth=200 origin main 2>/dev/null \
  && base=$(git merge-base HEAD FETCH_HEAD 2>/dev/null); then
  fallback=("--fallback=$base")
fi

# Construye solo si cambió la app o un paquete del que depende (packages/*, lockfile,
# turbo.json o el package.json raíz).
npx --yes turbo-ignore@2.11.9 "${fallback[@]}"
