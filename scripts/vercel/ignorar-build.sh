#!/usr/bin/env bash
# Ignored Build Step de los proyectos de Vercel conectados a Git (ignoreCommand de
# apps/web-*/vercel.json). Vercel lo corre desde la carpeta de la app.
# exit 0 = no construir; exit 1 = construir.
#
# Los deploys de deploy-staging.yml y deploy-production.yml usan la CLI (vercel build +
# deploy --prebuilt) y no pasan por acá.
set -u

# Quién construye: VERCEL_URL empieza con el nombre del proyecto
# (<proyecto>-<hash>-<equipo>.vercel.app). El hash no lleva guiones, así que
# "menyu-admin-<hash>-..." nunca empieza como "menyu-admin-staging-...".
#
# Desde Git solo se construyen los proyectos de STAGING, que despliegan main:
# menyu-cliente-staging, menyu-admin-staging, menyu-staff-staging y menyu-auth-staging. Los de producción
# (menyu-cliente, menyu-admin, menyu-staff y menyu-auth) se despliegan con el tag (deploy-production.yml),
# nunca desde Git: ni en producción, ni en preview, ni en ninguna rama. Los apps/web-*/vercel.json
# se comparten entre el proyecto de producción y el de staging de cada app, así que la diferencia
# la marca este archivo. Si VERCEL_URL no viene, tampoco se construye: ante la duda, no.
case "${VERCEL_URL:-}" in
  menyu-cliente-staging-* | menyu-admin-staging-* | menyu-staff-staging-* | menyu-auth-staging-*) ;;
  *)
    echo "Los proyectos de producción se despliegan con el tag (deploy-production.yml): no se construyen desde Git."
    exit 0
    ;;
esac

# Primer deploy de main de un proyecto de staging recién creado: Vercel no manda
# VERCEL_GIT_PREVIOUS_SHA y no hay con qué comparar. Compararlo contra el punto donde main salió
# de main (el propio commit) daría "sin cambios", y el proyecto nunca tendría su primer deploy.
if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && [ "${VERCEL_GIT_COMMIT_REF:-}" = "main" ]; then
  echo "Primer deploy de main de este proyecto: se construye."
  exit 1
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
