# Confiabilidad y rendimiento

## Cambios

- Cada envio de la cola tiene un identificador propio. La confirmacion de un envio anterior no descarta un guardado posterior.
- Las escrituras usan la version confirmada por PostgreSQL; los conflictos quedan pendientes y se revisan desde el indicador de sincronizacion.
- Las eliminaciones generan marcadores por equipo para que un cache antiguo no restaure registros borrados.
- Los recurrentes devuelven el egreso canonico al reintentar. Se elimina la alternativa no transaccional y la limpieza automatica de registros al iniciar.
- Apartados y perdidas se guardan por equipo. Los apartados registran importe, fecha y actor; los registros historicos sin esos datos no los inventan. Donacion sigue fuera del calculo fiscal.
- Restauracion centralizada, validacion previa, copia de recuperacion y errores visibles si falta subir datos. Nunca se ejecutan operaciones de cola importadas de un archivo.
- Lecturas paginadas por cursor, filtros de fecha completos, peticiones compartidas durante 15 segundos y actualizaciones locales reactivas.
- RLS restringe lectura financiera a admin/contador. Seguimiento publico devuelve solo los datos mostrados al cliente.
- PRs ejecutan lint, pruebas unitarias, build estatico, Playwright aislado y regresiones PostgreSQL/RLS. Los tests no necesitan cuentas productivas.

## Publicacion

Aplicar `supabase/migrations/20260913193009_reliability_and_finance_persistence.sql` antes de publicar el cliente que usa los RPC nuevos. Es aditiva, salvo el endurecimiento de permisos SELECT y la reduccion del payload publico. No elimina egresos ni cambia importes existentes.

No volver a ejecutar los SQL historicos manualmente sobre produccion. El runner `scripts/test-db.sh` solamente acepta una base local vacia llamada `studio24_test`; omite el cron INPC y prepara las dependencias de plataforma necesarias para reproducir la historia.

## Validacion

`npm run lint`, `npm test`, `npm run build` y `npm run test:e2e`.

Los E2E predeterminados sirven `out/` en `http://127.0.0.1:3107/studio24/`. CI ejecuta `e2e/isolated.spec.ts`; los E2E antiguos con credenciales siguen siendo opcionales y no deben apuntar a produccion para pruebas de escritura.

## Limites deliberados

- La restauracion es un merge versionado, no borra en nube los registros ausentes del respaldo. Un registro eliminado en otro dispositivo requiere revision, no se resucita automaticamente.
- El bloqueo entre pestanas serializa los envios. La API versionada protege cambios concurrentes entre dispositivos; no se sobrescriben conflictos automaticamente.
- Las pantallas conservan sus componentes principales. Se extrajeron persistencia financiera, restauracion y revision de conflictos; no se reescribieron pedidos, facturas ni egresos completos.
- Las tablas ISR y los criterios de deduccion no se modifican en esta entrega. Las perdidas estimadas de ejercicios anteriores requieren confirmacion explicita.
- El DSN permite recibir eventos; sourcemaps requieren ademas SENTRY_AUTH_TOKEN, SENTRY_ORG y SENTRY_PROJECT. No se necesitan para publicar la aplicacion.
