# Plan de rollback de producción

Qué hacer si un release (`vX.Y.Z`) rompe producción. Revisar cada paso contra el panel de Railway y de Vercel antes de usarlo: los nombres de los botones pueden cambiar.

## Cuándo

- El smoke de `Deploy — Production` falla después de desplegar, o
- aparece un error que bloquea a los comensales (no pueden abrir mesa, pedir o pagar) después de un tag.

Un error menor se arregla con un tag nuevo (`vX.Y.Z+1`), no con rollback.

## 0. Antes de tocar nada

1. Anotar el tag y el SHA que fallaron, y el último tag sano (el anterior en `git tag -l 'v*'`).
2. Fijarse si el release trae migraciones de Prisma:
   `git diff <tag-sano> <tag-malo> -- apps/backend/prisma/migrations`
   - **Sin migraciones**: seguir con los pasos 1 y 2.
   - **Con migraciones**: leer el paso 3 antes de volver atrás el backend.

## 1. Backend (Railway, producción)

- Panel de Railway → servicio de producción → *Deployments* → el deploy del tag sano → *Redeploy*. No hace falta el CLI ni un token en una máquina local.
- Verificar `GET /api/health`: el SHA tiene que volver a ser el del tag sano.
  `APP_COMMIT_SHA` es una variable del servicio: si el redeploy no la restaura, `/health` sigue mostrando el SHA malo aunque el código sea el sano. Corregirla desde el panel.

## 2. Frontends (Vercel, los 3 proyectos)

Para web-admin, web-cliente y web-staff, por separado:

- Panel de Vercel → proyecto → *Deployments* → el deploy de producción del tag sano → *Promote to Production* (o *Instant Rollback* sobre el actual).
- Un rollback de Vercel no crea deployments nuevos, así que no gasta la cuota diaria.

## 3. Base de datos (Supabase)

Prisma no tiene migraciones "down". De menor a mayor riesgo:

1. **La migración es compatible hacia atrás** (solo agrega columnas o tablas, con default o nullables): dejar la base como está y volver atrás solo el código.
2. **No es compatible**: no volver atrás el backend. Corregir hacia adelante con un tag nuevo.
3. **Pérdida o corrupción de datos**: restaurar el backup de Supabase a un punto en el tiempo. Es una decisión del equipo, con la ventana de datos que se pierde anotada.

Para que el rollback siga siendo posible, las migraciones de un release solo agregan. Lo que borra o renombra va en un release posterior, cuando el código viejo ya no lo usa.

## 4. Después

- Correr el smoke a mano: *Actions* → *Deploy — Production* → *Run workflow*, eligiendo **el tag sano** en "Use workflow from". Con `workflow_dispatch` solo corren el chequeo del CI y el smoke; no se despliega.
- Anotar en la bitácora qué falló, qué se volvió atrás y el tag del arreglo.
- No borrar el tag malo: queda como registro. El arreglo sale con el número siguiente.

## Tags

- Solo `vX.Y.Z` con números despliega a producción. El filtro del workflow y el primer paso de `check-ci` rechazan cualquier otro formato (`v1.0.6-rc.1`, `v1.2.3.4`).
- No crear tags de prueba en `MenYUorg/MenYU`: un tag con formato válido despliega.
