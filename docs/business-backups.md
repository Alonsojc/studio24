# Respaldos del negocio

El workflow `Encrypted business backup` se ejecuta cada dia a las 09:23 UTC
(03:23 de Ciudad de Mexico), independientemente de los navegadores abiertos.
Tambien puede ejecutarse manualmente desde GitHub Actions.

La copia incluye un snapshot consistente de las tablas del negocio, el historial
de adelantos, auditoria, configuracion, los archivos de Storage (PDF, XML, fotos
y comprobantes), metadatos de archivos y las migraciones. Excluye el bucket de
respaldos para evitar copiar respaldos recursivamente. No contiene contrasenas,
sesiones ni claves API. La recuperacion de usuarios de Auth se coordina por separado
con sus identificadores de perfil; no se exportan hashes de contrasenas.

Cada copia se cifra con AES-256-GCM y una clave derivada con scrypt. Los archivos
temporales se eliminan al terminar. Se comprueban la autenticidad del cifrado,
los hashes SHA-256, tamanos de archivos, referencias a facturas y comprobantes,
estabilidad de versiones de Storage y cantidades de registros antes de publicar
el artefacto. GitHub conserva catorce dias de copias cifradas fuera de Supabase.

## Configuracion

- `SUPABASE_BACKUP_KEY`: secreto de Actions del proyecto. Solo lo usa este workflow.
- `STUDIO24_BACKUP_PASSPHRASE`: clave de recuperacion, minimo 32 caracteres.
- `NEXT_PUBLIC_SUPABASE_URL`: variable de repositorio existente.

Conservar una copia independiente de la clave de recuperacion. Sin esa clave no
se puede descifrar el respaldo. Nunca incluirla en Git, comentarios o logs.

La ubicacion de la copia en el Llavero del Mac y el comando para comprobarla sin
mostrar su valor estan en [Recuperacion de accesos](access-recovery.md#custodia-de-la-clave).
Esa guia tambien cubre contrasenas, accesos a GitHub/Supabase y la recuperacion
de identidades conservando sus UUID. No confundir el simulacro local con una
restauracion completa de Supabase Auth.

## Comprobar una copia

Descargar el artefacto cifrado de una ejecucion correcta. Proporcionar la clave
mediante la variable de entorno y ejecutar:

```sh
node scripts/business-backup.mjs verify /ruta/studio24.enc
```

El comando descifra en un directorio temporal, comprueba los datos y lo elimina.
No conecta ni escribe a la base de datos. Una recuperacion real debe prepararse
en un proyecto aislado, recrear el esquema con las migraciones y validar las
relaciones e importes antes de cambiar el proyecto utilizado por la aplicacion.
El JSON del respaldo completo no es un archivo para importar desde Ajustes.

## Simulacro de restauracion

Despues de conservar el archivo cifrado, el workflow prepara PostgreSQL 17
aislado y ejecuta `scripts/restore-drill.mjs`. Restaura todas las tablas del
snapshot, conserva valores y versiones, verifica claves foraneas, reajusta
secuencias y vuelve a habilitar los triggers. Copia y compara los bytes de los
archivos recuperados. Un fallo marca la ejecucion como fallida, pero conserva
el respaldo cifrado para investigacion.

Antes de insertar, compara las columnas de cada fila con el esquema de destino.
Una diferencia falla indicando tabla y cantidad de columnas, nunca valores ni
datos de clientes. No se ignoran campos desconocidos ni se rellena evidencia
faltante para hacer pasar la comparacion. Revisar las migraciones aplicadas y
usar un esquema compatible con el respaldo; conservar siempre el archivo original.
El primer simulacro real detecto que faltaba `proveedores.rfc` en produccion.
`20261025183936_align_provider_rfc.sql` aplica esa columna ya prevista por el
proyecto, sin inferir RFCs ni cambiar movimientos existentes.

El comando solo admite `studio24_test` en localhost, vacio salvo el catalogo
INPC de las migraciones y con el esquema Auth ficticio de pruebas. Rechaza una
base ya usada. No es una herramienta para restaurar sobre produccion.

```sh
SCHEMA_ONLY=1 bash scripts/test-db.sh
node scripts/restore-drill.mjs /ruta/studio24.enc
```

Requiere `TEST_DATABASE_URL` y `STUDIO24_BACKUP_PASSPHRASE` en el entorno.
La suite `scripts/test-db.sh` tambien comprueba un ciclo completo con datos
sinteticos y un cobro posterior a la recuperacion. Las identidades de Auth se
recrean solo como referencias: no recupera contrasenas, sesiones, permisos de
la plataforma ni configura un proyecto Supabase nuevo. Una recuperacion real
sigue requiriendo validar esos componentes por separado antes de cambiar el sitio.

Si faltan credenciales, falla una descarga o se exceden 512 MiB de evidencia,
el workflow falla y no publica una copia incompleta. Revisar cualquier aviso de
fallo de GitHub Actions antes de considerar que el respaldo esta actualizado.
