# Studio 24 Supabase migrations

Aplicar en orden ascendente por timestamp.

Los `.sql` de la raíz se conservan como referencia histórica y para no romper enlaces existentes, pero producción debe avanzar con esta carpeta.

Orden actual:

1. `202604270001_initial_schema.sql`
2. `202604270002_missing_columns.sql`
3. `202604270003_proveedor_rfc.sql`
4. `202604270004_roles.sql`
5. `202604270005_teams.sql`
6. `202604270006_accept_invitations.sql`
7. `202604270007_cleanup_invites.sql`
8. `202604270008_facturas_storage.sql`
9. `202604270009_photos_team_scoped.sql`
10. `202604270010_inpc.sql`
11. `202604270011_inpc_cron.sql`
12. `202604270012_hardening.sql`

Antes de correr una migración nueva en producción:

- probarla en local/staging;
- confirmar que es idempotente o que sólo corre una vez;
- revisar Advisor de Supabase después de aplicarla;
- guardar evidencia de backup y restore probado.
