# Recuperacion de accesos de Studio24

Guia operativa revisada el 27 de octubre de 2026. No contiene contrasenas,
tokens, codigos de recuperacion ni datos personales de usuarios.

## Que hacer primero

| Problema | Procedimiento | No hacer |
| --- | --- | --- |
| Olvide la contrasena de Studio24 | A: recuperar la cuenta existente | Borrar el usuario o registrar otro para reemplazarlo |
| No puedo entrar a GitHub o al panel de Supabase | B: recuperar la cuenta de la plataforma | Confundirla con la cuenta que entra a Studio24 |
| Se perdio el proyecto o sus usuarios de Auth | C: reconstruir en un destino aislado | Restaurar encima de produccion o cambiar los UUID |
| Se perdio el Mac o la clave del respaldo | D: recuperar la clave | Rotarla y asumir que las copias anteriores se podran abrir |

Antes de cualquier recuperacion real, registrar incidente, responsable,
proyecto afectado y ultimo respaldo utilizable. Conservar el original cifrado.
Un sitio lento o una caida de red no justifican borrar usuarios ni restaurar datos.
Pedir autorizacion especifica antes de modificar accesos, roles o el destino de
produccion. Esta guia no es una autorizacion permanente para hacerlo.

## Referencias del sistema

| Recurso | Referencia |
| --- | --- |
| Aplicacion | <https://alonsojc.github.io/studio24/> |
| Repositorio | <https://github.com/Alonsojc/studio24> |
| Proyecto Supabase | `trbhkegniatdhkebzncu` |
| Panel Supabase | <https://supabase.com/dashboard/project/trbhkegniatdhkebzncu> |
| API actual | `https://trbhkegniatdhkebzncu.supabase.co` |
| Respaldo diario | [Encrypted business backup](https://github.com/Alonsojc/studio24/actions/workflows/backup.yml) |
| Publicacion | [Deploy to GitHub Pages](https://github.com/Alonsojc/studio24/actions/workflows/deploy.yml) |
| Sentry | Organizacion `studio24-aq`, proyecto `studio23` |

## Custodia de la clave

La copia independiente de GitHub se guarda en el Llavero **inicio de sesion**
(`login`) de este Mac, con estos identificadores no secretos:

- Nombre: `Studio24 - Clave de recuperacion de respaldos`.
- Servicio: `com.studio24.backup-recovery`.
- Cuenta: `STUDIO24_BACKUP_PASSPHRASE`.

Para localizarla, abrir **Acceso a Llaveros**, seleccionar el llavero de inicio
de sesion y buscar el nombre o servicio anterior. Para mostrar la contrasena,
macOS puede pedir la autorizacion del usuario. No compartir capturas de ese campo.

Es un elemento del Llavero local, no una garantia de sincronizacion con iCloud ni
con la app Contrasenas. Si se pierde el Mac y no hay otra copia recuperable del
llavero o de la clave, esta copia tambien puede perderse. Mantener el acceso al
usuario del Mac y su respaldo; no guardar su unica recuperacion dentro de GitHub.

### Comprobar la clave sin mostrarla

Descargar un artefacto de una ejecucion correcta del workflow de respaldo.
Desde la raiz del repositorio, con Node y las dependencias instaladas, ejecutar
lo siguiente sustituyendo solamente la ruta al archivo `.enc`:

```sh
(
  set +x
  STUDIO24_BACKUP_PASSPHRASE="$(/usr/bin/security find-generic-password \
    -s com.studio24.backup-recovery \
    -a STUDIO24_BACKUP_PASSPHRASE \
    -w "$HOME/Library/Keychains/login.keychain-db")" || exit 1
  export STUDIO24_BACKUP_PASSPHRASE
  node scripts/business-backup.mjs verify /ruta/al/studio24.enc
)
```

macOS puede solicitar permiso para leer el elemento. El comando no cambia la
base de datos; descifra temporalmente, comprueba integridad y elimina el temporal.
El resultado debe incluir `"verified":true`. No ejecutar la consulta del Llavero
con `-w` por separado, usar `echo` sobre la variable ni activar trazas de shell.
La clave se transmite al verificador en su entorno, no como argumento del proceso.

GitHub conserva 14 dias de artefactos. Durante un incidente, descargar y conservar
el respaldo elegido antes de que expire. La clave sola no reemplaza ese archivo.

## A. Recuperar una contrasena de Studio24

1. Abrir el sitio oficial y elegir **Olvidaste tu contrasena?**. Usar el correo
   de la cuenta existente; no registrar una cuenta nueva como sustituto.
2. Abrir el correo de recuperacion mas reciente, revisar tambien spam y definir
   la nueva contrasena en la pantalla **Nueva contrasena**. No reenviar el enlace:
   concede acceso de recuperacion y puede caducar o quedar consumido.
3. Confirmar que se puede entrar, que aparece el equipo correcto y que el rol y
   los datos visibles son los esperados. Probar tambien desde una sesion nueva.
4. Si el correo no llega, un administrador autorizado debe comprobar en el panel
   de Supabase que el usuario existe y revisar Auth, entrega de correo/SMTP y
   limites. La confirmacion en pantalla no demuestra que el mensaje fue recibido.
5. Comprobar en Auth > URL Configuration el Site URL
   `https://alonsojc.github.io/studio24/` y la redireccion permitida
   `https://alonsojc.github.io/studio24/ajustes`, usada por `src/lib/auth.ts`.
   Evitar comodines amplios; adaptar solo si se cambia deliberadamente el sitio.

Si se perdio acceso al correo, verificar la identidad por un canal independiente
antes de cambiarlo mediante administracion autorizada. Mantener el mismo
`auth.users.id`. No desactivar RLS, confirmar correos a ciegas ni cambiar roles
para resolver un problema de entrega. Si hay sospecha de robo de cuenta, revisar
y revocar sesiones mediante los controles de Auth; no asumir que cambiar una
contrasena invalida de inmediato todos los tokens ya emitidos.

## B. Recuperar GitHub o el panel de Supabase

Estas cuentas son diferentes a los usuarios de Studio24. Ser `admin` dentro de
Studio24 no concede acceso al repositorio ni a la organizacion de Supabase.

- **GitHub:** usar el metodo de acceso ya registrado, una passkey o un codigo
  de recuperacion de 2FA. Conservar esos medios fuera de la propia cuenta de
  GitHub. No regenerarlos durante una comprobacion: los codigos anteriores dejan
  de servir al regenerarlos. Seguir la
  [guia oficial de recuperacion](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials).
- **Panel Supabase:** usar el proveedor con que se registro la cuenta o su
  recuperacion de contrasena. Si usa MFA, conservar un segundo factor TOTP en
  otro dispositivo o ubicacion segura. La
  [MFA del panel](https://supabase.com/docs/guides/platform/multi-factor-authentication)
  no entrega codigos de recuperacion y el soporte no promete recuperar una cuenta
  que perdio todos sus factores. No confundirla con MFA de usuarios de la app.
- Si otro propietario autorizado conserva acceso a la organizacion, coordinar
  con el la recuperacion administrativa. No asumir que existe un segundo
  propietario: verificarlo con el titular. Una invitacion no restaura por si sola
  una cuenta bloqueada ni sus recursos personales.
- Tras recuperar acceso, comprobar repositorio/proyecto correctos, miembros,
  permisos, workflows y respaldos. No rotar claves indiscriminadamente.

El titular debe confirmar personalmente la custodia del segundo factor, el acceso
al correo y los metodos de recuperacion de cada plataforma. Esta guia no afirma
que ya se hayan configurado o probado, y no requiere compartirlos con Codex.

## C. Recuperar usuarios tras perder el proyecto

Este es un procedimiento para un tecnico autorizado, **no un boton de restaurar**.
El respaldo de negocio incluye `profiles`, `teams`, `team_members` y referencias
historicas, pero **no** contrasenas, sesiones, factores MFA ni identidades OAuth
de Supabase Auth. El simulacro local utiliza una tabla Auth ficticia; no demuestra
por si solo que una cuenta real pueda iniciar sesion en otro proyecto.

1. Acordar el alcance, la fecha de corte y el responsable; conservar evidencia y
   detener escrituras durante el cambio definitivo. Confirmar que los dispositivos
   no tienen cambios pendientes que se perderian al cambiar de proyecto.
2. Preparar un proyecto nuevo y aislado, sin apuntar la aplicacion de produccion
   hacia el. Elegir PostgreSQL compatible, aplicar las migraciones del respaldo
   y comprobar las columnas, funciones, triggers, permisos y RLS. Bloquear el
   registro publico durante la recuperacion. No copiar claves de produccion ni
   activar cron, webhooks o envios de correo durante el ensayo.
3. Verificar el `.enc`. En un entorno privado, preparar el mapa de UUID y correos
   desde `profiles`, propietarios de `teams`, `team_members` y **todas** las claves
   foraneas que apuntan a `auth.users`. Revisar duplicados o correos faltantes con
   el titular. Un correo distinto o un UUID sin identidad confirmada queda pendiente;
   no inventar usuarios, correos ni privilegios para completar la restauracion.
4. **Antes de crear cualquier usuario**, tratar `on_auth_user_created`: llama a
   `handle_new_user` y puede crear equipos/perfiles o aceptar invitaciones. En el
   destino aislado, el tecnico debe registrar el estado previo y suspender
   temporalmente **solo ese trigger de aplicacion**. No deshabilitar triggers
   internos de Supabase Auth ni usar este paso sobre produccion.
5. Recrear las identidades autorizadas con los **mismos UUID**, antes de cargar
   sus referencias. La API administrativa `auth.admin.createUser` admite `id`
   en la version instalada. Ejecutarla solo en un proceso de servidor privado,
   con una clave administrativa **del destino**; nunca desde el navegador ni
   usando la clave publica. No restaurar contrasenas conocidas ni enviar claves
   compartidas. Confirmar la identidad y establecer acceso nuevo de forma individual.
   Al terminar esta fase, incluso si falla parcialmente, restaurar y comprobar el
   estado previo del trigger. Confirmar que no aparecieron equipos o membresias
   inesperados. Ante cualquier fallo, mantener el registro bloqueado y el destino
   aislado; detenerse sin continuar con la importacion ni borrar usuarios a ciegas.
6. Restaurar los registros con UUID, equipos, roles y cantidades originales, y
   los objetos de Storage en sus buckets/rutas originales. Validar integridad,
   conteos, hashes, secuencias, permisos de buckets y referencias a comprobantes.
   `scripts/restore-drill.mjs` **solo admite localhost/studio24_test**: no quitar
   ese limite ni convertirlo en una herramienta improvisada de escritura remota.
   La carga real necesita un plan de importacion revisado para el destino elegido.
7. Ejecutar [el preflight de accesos](../scripts/access-recovery-preflight.sql).
   Resolver anomalias sin cambiar saldos ni promover usuarios automaticamente.
   Restaurar los roles de `team_members`; no basta con editar `profiles.role`.
   Si una identidad historica no debe tener acceso activo, conservar su referencia
   sin habilitarle el inicio de sesion y documentar la decision.
8. Configurar Auth (URL, correo/SMTP, proveedores y MFA), Storage, funciones y
   trabajos programados. Usar claves nuevas del destino. Para OAuth/MFA se requiere
   configuracion o enrolamiento nuevo; no vienen en este respaldo. Habilitar los
   trabajos externos solo despues de revisar su destino para evitar duplicados.
9. Enviar recuperaciones individuales solo a identidades verificadas. Probar login,
   recuperacion desde un dispositivo nuevo y permisos reales de admin/operador/contador
   en el proyecto aislado. Comprobar que no se accede a equipos ajenos ni como anonimo.
   No crear ventas o cobros de prueba en los datos reales restaurados.
10. Con aprobacion del titular, actualizar los secretos/variables de GitHub del
    destino, publicar y comprobar sitio, archivos y permisos. No cambiar la URL
    publica hasta que las pruebas pasen. Mantener el origen intacto para rollback;
    si ya hubo nuevas escrituras en el destino, reconciliarlas antes de volver atras.

### Configuracion que hay que reponer

| Uso | Nombres actuales en GitHub | Tratamiento |
| --- | --- | --- |
| Conexion de la app | Variable `NEXT_PUBLIC_SUPABASE_URL`, secreto `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Valores del destino; quedan incorporados al build publico |
| Respaldo | Secretos `SUPABASE_BACKUP_KEY`, `STUDIO24_BACKUP_PASSPHRASE` | Clave administrativa nueva del destino; conservar la clave de cifrado necesaria para copias antiguas |
| Sentry | Secretos `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`; variables `SENTRY_ORG`, `SENTRY_PROJECT` | DSN publico; token solo para CI, nunca dentro de `NEXT_PUBLIC_*` |

Si faltan las credenciales de backup, no declarar completa la recuperacion.
Ejecutar un nuevo respaldo y su simulacro de restauracion despues del cambio.
No activar una suscripcion o un proyecto con costo sin aprobacion del titular.

## D. Perdida del Mac o de la clave

Recuperar la copia del Llavero desde un respaldo del Mac que realmente la contenga,
o usar otra copia de la misma clave previamente custodiada. No asumir que aparece
en iCloud. GitHub Actions no ofrece descargar el valor de un secreto ya guardado:
no intentar imprimirlo ni publicarlo como artefacto para recuperarlo.

Si no existe una copia recuperable de la clave, detenerse y documentar el incidente.
Mientras la fuente siga disponible, se puede acordar una nueva clave y crear nuevas
copias, pero eso **no** descifra las copias antiguas. Conservar siempre la evidencia
original; una rotacion exige custodiar y probar la nueva clave antes de darla por buena.

## Criterio de cierre

- Clave localizada y comprobada contra un respaldo real, sin revelar su valor.
- Proyecto, corte del respaldo y revision documentados; datos y archivos verificados.
- Usuarios conservan UUID, equipo y rol; ninguna anomalia del preflight sin explicar.
- Login y recuperacion probados con cuentas autorizadas, sin accesos cruzados.
- Configuracion, funciones y permisos restaurados; copia nueva y simulacro correctos.
- Autorizacion del cambio y plan de rollback registrados, sin movimientos duplicados.

El 27 de octubre de 2026 el preflight de produccion encontro 3 usuarios de Auth,
sin perfiles o membresias huerfanos, equipos sin admin ni discrepancias de correo.
El respaldo automatico [40482162239](https://github.com/Alonsojc/studio24/actions/runs/40482162239)
termino con el simulacro correcto. La clave del Llavero se leyo por separado y
verifico ese respaldo: 24 tablas y 101 archivos del manifiesto. Se retiro el
archivo original sin cifrar con autorizacion del titular; se conservaron las
copias `.enc`. Estos datos son una comprobacion puntual, no una certificacion
de restauracion de Auth en otro proyecto ni de custodia fuera del Mac.

## Fuentes y documentos relacionados

- [Respaldos del negocio](business-backups.md).
- [Recuperacion de contrasenas](https://supabase.com/docs/guides/auth/passwords).
- [Creacion administrativa de usuarios](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
- [Migracion y restauracion de Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [MFA del panel Supabase](https://supabase.com/docs/guides/platform/multi-factor-authentication).
- [Recuperacion de cuenta GitHub](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials).
