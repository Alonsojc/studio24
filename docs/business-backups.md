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

Si faltan credenciales, falla una descarga o se exceden 512 MiB de evidencia,
el workflow falla y no publica una copia incompleta. Revisar cualquier aviso de
fallo de GitHub Actions antes de considerar que el respaldo esta actualizado.
