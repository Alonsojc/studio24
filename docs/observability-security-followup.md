# Sentry y avisos de Supabase

## Sentry

La organizacion correcta es `studio24-aq`, y el proyecto existente se llama
`studio23` (ID `4512080763092992`). El ID coincide con el DSN configurado.
No pertenece a Credere y no se renombra como parte de esta entrega.

GitHub Actions genera mapas, inyecta Debug IDs con `@sentry/cli` fijado en
el lockfile y comprueba las referencias reales de Turbopack. La subida solo
ocurre fuera de PRs. Los mapas se eliminan y su ausencia se verifica antes
de publicar el artefacto de Pages. El token nunca se expone al build ni al cliente.

La subida requiere `SENTRY_AUTH_TOKEN` con alcance `org:ci` y las variables
`SENTRY_ORG=studio24-aq`, `SENTRY_PROJECT=studio23`. Sin el token, el paso
explica que la subida no esta activada; no constituye una subida exitosa.
Crear el token y guardarlo en GitHub requiere confirmacion del propietario.

Verificacion posterior: revisar el paso de subida en Actions y los Artifact
Bundles en Project Settings > Source Maps. Los JS publicados deben tener los
mismos Debug IDs, y los `.map` no deben servirse publicamente.

Referencia: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/

## Funcion updated_at

La migracion `20260913202935_harden_trigger_search_path.sql` fija `search_path`
a vacio sin cambiar el cuerpo, borrar triggers ni actualizar filas existentes.
Las pruebas SQL comprueban la configuracion y ejecutan un trigger en una tabla
temporal para verificar que la fecha sigue actualizandose.

## pg_net: pendiente de plataforma

Inspeccion de produccion del 13 de septiembre de 2026:

- `pg_net` 0.20.0 registra su extension en `public`, pero sus objetos viven en `net`.
- `extrelocatable=false`: no admite `ALTER EXTENSION ... SET SCHEMA`.
- El esquema pertenece a `supabase_admin`; `postgres` no hereda ese rol ni tiene
  `USAGE WITH GRANT OPTION`, por lo que no puede revocar esos permisos.
- El cron `sync-inpc-mensual` esta activo y usa `postgres`.
- No se altera la extension, su cola, el cron ni las reglas del Advisor.

No se usa `DROP EXTENSION`, `CASCADE` ni escritura de catalogos internos para
eliminar un aviso cosmeticamente. El aviso permanece abierto. La documentacion
indica que `net` no se expone por Data API y los roles de cliente son NOLOGIN;
su permiso USAGE por defecto no implica por si solo acceso desde el navegador.

Solicitud para soporte de Supabase: confirmar el tratamiento del aviso
`extension_in_public` para la extension administrada no relocatable `pg_net`
en `trbhkegniatdhkebzncu`, y proponer una remediacion compatible sin borrar la
cola ni interrumpir el cron del INPC. No se ha enviado una solicitud de soporte.

Referencias:
- https://supabase.com/docs/guides/database/extensions/pg_net#permissions
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

## Contrasenas filtradas

El proyecto esta en Free. El panel Email muestra la proteccion desactivada y
disponible solo en Pro o superior. Requiere aprobar el cambio de plan antes
de activarla. No se modifica la facturacion, ni se simula esta proteccion con
validacion exclusivamente en el navegador.

Referencia: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
